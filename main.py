from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session
from sqlalchemy import text, bindparam
from pydantic import BaseModel
from typing import List, Optional
import os
import uuid
import asyncio

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".csv"}

from dotenv import load_dotenv
load_dotenv()

from database import get_db, init_db, Document, Chunk

# Optional: set ACCESS_CODE in .env to require X-Access-Code header on all API routes
ACCESS_CODE = (os.getenv("ACCESS_CODE") or "").strip()


def require_access_code(request: Request):
    """If ACCESS_CODE is set, require access code via X-Access-Code or Authorization: Bearer <code>."""
    if not ACCESS_CODE:
        return
    # Accept X-Access-Code or Authorization: Bearer <code> (Bearer is less likely to be stripped by proxies)
    provided = (request.headers.get("X-Access-Code") or "").strip()
    if not provided:
        auth = (request.headers.get("Authorization") or "").strip()
        if auth.lower().startswith("bearer "):
            provided = auth[7:].strip()
    if provided != ACCESS_CODE:
        raise HTTPException(status_code=401, detail="Invalid or missing access code")

from chunker import (
    extract_text_from_pdf,
    extract_text_from_docx,
    extract_text_from_txt,
    extract_text_from_csv,
    chunk_text,
)
from llm import embed_texts, embed_query, stream_chat_response

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Document Q&A API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


# ─── Schemas ───────────────────────────────────────────────────────────────────

class DocumentResponse(BaseModel):
    id: str
    filename: str
    uploaded_at: str
    chunk_count: int
    version: int

    class Config:
        from_attributes = True


class ChunkPreview(BaseModel):
    id: str
    chunk_index: int
    content: str

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    question: str
    document_ids: Optional[List[str]] = None  # None = search all documents
    top_k: int = 5


# ─── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/documents", response_model=DocumentResponse)
@limiter.limit("10/minute")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: None = Depends(require_access_code),
):
    """Upload a document (PDF, DOCX, TXT, MD, CSV), parse it, chunk it, embed it, and store everything."""
    filename_lower = file.filename.lower()
    ext = next((e for e in SUPPORTED_EXTENSIONS if filename_lower.endswith(e)), None)
    if ext is None:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Allowed: .pdf, .docx, .txt, .md, .csv"
        )

    file_bytes = await file.read()

    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 20 MB.")

    # 1. Extract text based on file type
    try:
        if ext == ".pdf":
            raw_text = extract_text_from_pdf(file_bytes)
        elif ext == ".docx":
            raw_text = extract_text_from_docx(file_bytes)
        elif ext in (".txt", ".md"):
            raw_text = extract_text_from_txt(file_bytes)
        elif ext == ".csv":
            raw_text = extract_text_from_csv(file_bytes)
        else:
            raise ValueError(f"Unhandled extension: {ext}")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {str(e)}")

    if not raw_text.strip():
        raise HTTPException(status_code=422, detail="File appears to have no extractable text.")

    # 2. Chunk the text
    chunks = chunk_text(raw_text)

    # 3. Embed all chunks — fire all batches concurrently instead of serially
    BATCH_SIZE = 20
    batches = [chunks[i:i + BATCH_SIZE] for i in range(0, len(chunks), BATCH_SIZE)]
    batch_results = await asyncio.gather(*[embed_texts(batch) for batch in batches])
    all_embeddings = [emb for result in batch_results for emb in result]

    # 4. Versioning: if a document with the same filename exists, replace it
    next_version = 1
    existing_doc = db.query(Document).filter(Document.filename == file.filename).first()
    if existing_doc:
        next_version = existing_doc.version + 1
        db.delete(existing_doc)
        db.flush()  # cascade-deletes old chunks before inserting new ones

    # 5. Save new document + chunks to DB
    doc = Document(filename=file.filename, version=next_version)
    db.add(doc)
    db.flush()  # get the doc.id before committing

    for i, (content, embedding) in enumerate(zip(chunks, all_embeddings)):
        chunk = Chunk(
            document_id=doc.id,
            content=content,
            embedding=embedding,
            chunk_index=i
        )
        db.add(chunk)

    db.commit()
    db.refresh(doc)

    return DocumentResponse(
        id=str(doc.id),
        filename=doc.filename,
        uploaded_at=doc.uploaded_at.isoformat(),
        chunk_count=len(chunks),
        version=doc.version,
    )


@app.get("/api/documents", response_model=List[DocumentResponse])
def list_documents(db: Session = Depends(get_db), _: None = Depends(require_access_code)):
    """Return all uploaded documents with their chunk counts."""
    docs = db.query(Document).order_by(Document.uploaded_at.desc()).all()
    return [
        DocumentResponse(
            id=str(doc.id),
            filename=doc.filename,
            uploaded_at=doc.uploaded_at.isoformat(),
            chunk_count=len(doc.chunks),
            version=doc.version,
        )
        for doc in docs
    ]


@app.delete("/api/documents/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db), _: None = Depends(require_access_code)):
    """Delete a document and all its chunks."""
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document ID.")
    doc = db.query(Document).filter(Document.id == doc_uuid).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    db.delete(doc)
    db.commit()
    return {"message": f"Deleted document {document_id}"}


@app.get("/api/documents/{document_id}/chunks", response_model=List[ChunkPreview])
def get_document_chunks(
    document_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_access_code),
):
    """Return all chunks for a document, ordered by chunk_index. Does not include embeddings."""
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document ID.")

    doc = db.query(Document).filter(Document.id == doc_uuid).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    chunks = (
        db.query(Chunk)
        .filter(Chunk.document_id == doc_uuid)
        .order_by(Chunk.chunk_index)
        .all()
    )

    return [
        ChunkPreview(
            id=str(c.id),
            chunk_index=c.chunk_index,
            content=c.content,
        )
        for c in chunks
    ]


@app.post("/api/chat")
@limiter.limit("30/minute")
async def chat(request: Request, body: ChatRequest, db: Session = Depends(get_db), _: None = Depends(require_access_code)):
    """
    Embed the question, find the most relevant chunks via vector search,
    then stream a GPT-4o response citing sources.
    """
    # 1. Embed the question
    question_embedding = await embed_query(body.question)

    # 2. Build vector similarity query using pgvector
    # Filter by document_ids if provided (only search in selected docs)
    embedding_str = "[" + ",".join(str(x) for x in question_embedding) + "]"

    # Normalize: only use non-empty, valid UUIDs so the filter is strict
    doc_ids_raw = [str(did).strip() for did in (body.document_ids or []) if did and str(did).strip()]
    doc_ids_to_use = []
    for did in doc_ids_raw:
        try:
            doc_ids_to_use.append(uuid.UUID(did))
        except ValueError:
            pass

    if doc_ids_to_use:
        sql = text("""
            SELECT c.content, d.filename, c.embedding <=> :embedding AS distance
            FROM chunks c
            JOIN documents d ON c.document_id = d.id
            WHERE c.document_id IN :doc_ids
            ORDER BY distance ASC
            LIMIT :top_k
        """).bindparams(bindparam("doc_ids", expanding=True))
        results = db.execute(sql, {
            "embedding": embedding_str,
            "top_k": body.top_k,
            "doc_ids": doc_ids_to_use,
        }).fetchall()
    else:
        sql = text("""
            SELECT c.content, d.filename, c.embedding <=> :embedding AS distance
            FROM chunks c
            JOIN documents d ON c.document_id = d.id
            ORDER BY distance ASC
            LIMIT :top_k
        """)
        results = db.execute(sql, {
            "embedding": embedding_str,
            "top_k": body.top_k,
        }).fetchall()

    if not results:
        raise HTTPException(status_code=404, detail="No relevant content found. Try uploading a document first.")

    context_chunks = [
        {"content": row.content, "filename": row.filename}
        for row in results
    ]

    # 3. Stream the response
    async def generate():
        async for token in stream_chat_response(body.question, context_chunks):
            yield token

    return StreamingResponse(generate(), media_type="text/plain")
