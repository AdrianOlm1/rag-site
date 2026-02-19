import os
from openai import AsyncOpenAI
from typing import List, AsyncGenerator
from dotenv import load_dotenv

load_dotenv()

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

EMBEDDING_MODEL = "text-embedding-3-small"
CHAT_MODEL = "gpt-4o"


async def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Embed a list of texts using OpenAI's embedding model.
    Returns a list of embedding vectors.
    """
    response = await client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts
    )
    return [item.embedding for item in response.data]


async def embed_query(query: str) -> List[float]:
    """Embed a single query string."""
    embeddings = await embed_texts([query])
    return embeddings[0]


async def stream_chat_response(
    question: str,
    context_chunks: List[dict]  # each dict has 'content' and 'filename'
) -> AsyncGenerator[str, None]:
    """
    Given a question and relevant context chunks, stream a GPT-4o response.
    Each yielded value is a string token to send to the client.
    """
    # Build context string with source citations
    context_parts = []
    for i, chunk in enumerate(context_chunks):
        context_parts.append(f"[Source: {chunk['filename']}]\n{chunk['content']}")
    context = "\n\n---\n\n".join(context_parts)

    system_prompt = """You are a helpful assistant that answers questions based strictly on the provided document context.

Rules:
- Only use information from the provided context to answer.
- If the context doesn't contain enough information to answer, say so clearly.
- Always cite which document(s) your answer comes from, using the [Source: filename] labels.
- Be concise and accurate."""

    user_prompt = f"""Context:
{context}

Question: {question}"""

    stream = await client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        stream=True,
        temperature=0.2,  # low temp for factual accuracy
        max_tokens=1024
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content
