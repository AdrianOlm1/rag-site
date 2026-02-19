# doc.qa — Document Q&A with RAG

A full-stack app to chat with your PDFs using retrieval-augmented generation (RAG).

## Stack

- **Frontend**: React + Vite (no UI library, custom CSS)
- **Backend**: Python + FastAPI
- **Database**: PostgreSQL + pgvector extension
- **AI**: OpenAI `text-embedding-3-small` + `gpt-4o`

## Architecture

```
Upload PDF → parse text → chunk into 500-token pieces
         → embed each chunk (OpenAI) → store in pgvector

Ask question → embed question → cosine similarity search
            → retrieve top 5 chunks → GPT-4o with context → stream response
```

## Setup

### Prerequisites

- Docker + Docker Compose
- Python 3.11+
- Node 18+
- OpenAI API key

### 1. Start the database

```bash
docker-compose up -d
```

This starts a PostgreSQL 16 instance with pgvector pre-installed on port 5432.

### 2. Set up the backend

```bash
cd backend
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
# DATABASE_URL is already set for the docker-compose db

pip install -r requirements.txt
uvicorn main:app --reload
```

Backend runs at http://localhost:8000
Swagger docs at http://localhost:8000/docs

### 3. Set up the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at http://localhost:5173

## Access code (optional)

To avoid unauthorized use and protect your OpenAI credits, you can require an access code:

1. In your `.env`, set `ACCESS_CODE` to a secret string (e.g. `ACCESS_CODE=my-secret-code`).
2. Restart the backend. The app will then show an “Enter access code” screen; only requests that send the correct code (in the `X-Access-Code` header) can list documents, upload, delete, or chat.
3. Share the code only with people you want to have access. The code is stored in the browser session until they click **Lock** or close the tab.

If `ACCESS_CODE` is not set, the app works as before with no gate.

## Usage

1. Open http://localhost:5173 (enter the access code if you set `ACCESS_CODE`).
2. Drag and drop a PDF into the sidebar (it will be parsed, chunked, and embedded — takes a few seconds)
3. Ask questions in the chat box
4. Optionally select specific documents from the sidebar to narrow the search scope

## Key concepts to understand

- **Chunking**: PDFs are split into ~500 token pieces with 50 token overlap so context isn't cut off at boundaries
- **Embeddings**: Each chunk is converted to a 1536-dim vector capturing its semantic meaning
- **Cosine similarity**: When you ask a question, its embedding is compared to all chunk embeddings — closest ones win
- **RAG prompt**: The top 5 matching chunks are injected into GPT-4o's context along with your question
- **Streaming**: The response is streamed token-by-token for a responsive feel

## Deployment

- **Backend**: Deploy to [Railway](https://railway.app) or [Render](https://render.com) — both support Python and Postgres
- **Frontend**: Deploy to [Vercel](https://vercel.com) — just point it at the `frontend` folder
- **Database**: Railway has a managed Postgres addon with pgvector support

Remember to update the CORS origin in `main.py` and the API URL in `App.jsx` when deploying.
