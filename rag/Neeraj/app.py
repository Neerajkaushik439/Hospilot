"""
Ask Hospilot — FastAPI application.
Serves a simple HTML form and a /ask endpoint for the RAG pipeline.
"""

import os
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

import rag_engine

# ── App setup ────────────────────────────────────────────────────────────────

app = FastAPI(title="Ask Hospilot", description="Hospital data Q&A powered by RAG")

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")


@app.on_event("startup")
def startup():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("[WARN] WARNING: GEMINI_API_KEY not set. LLM calls will fail.")
        print("   Get a free key at https://aistudio.google.com/apikey")
    else:
        rag_engine.configure_llm(api_key)
        print("[OK] Gemini API configured")

    # Check if database exists
    if not os.path.exists(rag_engine.DB_PATH):
        print("[WARN] Database not found. Run: python seed_data.py")
    else:
        print(f"[OK] Database loaded from {rag_engine.DB_PATH}")


@app.get("/", response_class=HTMLResponse)
async def index():
    """Serve the main HTML page."""
    html_path = os.path.join(TEMPLATE_DIR, "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@app.post("/ask")
async def ask_question(request: Request):
    """
    Accept a question and run the full RAG pipeline.
    Returns JSON with: question, sql, results, answer, error
    """
    body = await request.json()
    question = body.get("question", "").strip()

    if not question:
        return JSONResponse(
            status_code=400,
            content={"error": "Please provide a question."},
        )

    if len(question) > 1000:
        return JSONResponse(
            status_code=400,
            content={"error": "Question too long (max 1000 characters)."},
        )

    result = rag_engine.ask(question)
    return JSONResponse(content=result)


@app.get("/health")
async def health():
    """Health check endpoint."""
    db_exists = os.path.exists(rag_engine.DB_PATH)
    api_key_set = bool(os.getenv("GEMINI_API_KEY"))
    return {
        "status": "ok" if (db_exists and api_key_set) else "degraded",
        "database": "loaded" if db_exists else "missing",
        "llm": "configured" if api_key_set else "missing_api_key",
    }
