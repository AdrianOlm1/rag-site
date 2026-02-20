import io
import csv
import pdfplumber
import tiktoken
from typing import List

# Use cl100k_base tokenizer (same as OpenAI embedding models)
tokenizer = tiktoken.get_encoding("cl100k_base")

CHUNK_SIZE = 500    # tokens per chunk
CHUNK_OVERLAP = 50  # token overlap between chunks


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract all text from a PDF file given as bytes."""
    text_parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text.strip())
    return "\n\n".join(text_parts)


def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from a .docx file."""
    from docx import Document as DocxDocument
    doc = DocxDocument(io.BytesIO(file_bytes))
    parts = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(parts)


def extract_text_from_txt(file_bytes: bytes) -> str:
    """Extract text from a .txt or .md file (plain UTF-8 decode)."""
    return file_bytes.decode("utf-8", errors="replace")


def extract_text_from_csv(file_bytes: bytes) -> str:
    """Convert CSV rows to readable text, one row per line of 'col: val' pairs."""
    text_io = io.StringIO(file_bytes.decode("utf-8", errors="replace"))
    reader = csv.DictReader(text_io)
    rows = []
    for row in reader:
        row_parts = [f"{k}: {v}" for k, v in row.items() if v and v.strip()]
        if row_parts:
            rows.append(", ".join(row_parts))
    return "\n".join(rows)


def chunk_text(text: str) -> List[str]:
    """
    Split text into overlapping chunks based on token count.
    Returns a list of text chunk strings.
    """
    tokens = tokenizer.encode(text)
    chunks = []
    start = 0

    while start < len(tokens):
        end = start + CHUNK_SIZE
        chunk_tokens = tokens[start:end]
        chunk_text = tokenizer.decode(chunk_tokens)
        chunks.append(chunk_text)

        # Move forward by CHUNK_SIZE - CHUNK_OVERLAP so chunks overlap
        start += CHUNK_SIZE - CHUNK_OVERLAP

        # Avoid tiny final chunks — merge into previous if < 50 tokens
        if start < len(tokens) and len(tokens) - start < 50:
            chunk_tokens = tokens[start:]
            chunk_text = tokenizer.decode(chunk_tokens)
            chunks.append(chunk_text)
            break

    return chunks
