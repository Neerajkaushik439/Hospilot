# Ask Hospilot — RAG Service

> **Candidate:** Neeraj  
> A text-to-SQL RAG service that lets hospital staff ask plain-English questions about hospital operations and get accurate, data-grounded answers.

---

## Quick Start

```bash
# 1. Navigate to this directory
cd rag/Neeraj

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set up environment variables
copy .env.example .env
# Edit .env and add your Gemini API key (get one free at https://aistudio.google.com/apikey)

# 4. Seed the database with sample data
python seed_data.py

# 5. Run the server
uvicorn app:app --port 8002 --reload

# 6. Open in browser
# http://localhost:8002
```

---

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────┐     ┌──────────────────┐     ┌──────────────┐
│  User types  │────▶│  LLM (Pass 1)    │────▶│  SQLite  │────▶│  LLM (Pass 2)    │────▶│  Human-      │
│  a question  │     │  text → SQL      │     │  execute │     │  results → prose  │     │  readable    │
│              │     │                  │     │  query   │     │                  │     │  answer      │
└─────────────┘     └──────────────────┘     └──────────┘     └──────────────────┘     └──────────────┘
```

### Two-Pass LLM Pipeline

**Pass 1 — SQL Generation**  
The LLM receives the full database schema as context and the user's question. It generates a single SQLite `SELECT` query. The system prompt includes:
- Complete table/column definitions
- Known enum values for statuses, shifts, etc.
- Instructions to output `UNANSWERABLE` for questions outside the schema's scope

**Pass 2 — Answer Synthesis**  
The LLM receives the original question, the SQL query that was executed, and the raw query results. It produces a clear, human-readable answer with:
- Bold key numbers and names
- Bullet points for multi-row results
- Brief contextual insights

### Safety Mechanisms
- **Read-only database connection**: SQLite is opened in `?mode=ro` (read-only URI mode)
- **SQL validation**: A regex blocks `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, etc.
- **Auto-retry**: If the first SQL query fails (syntax error, wrong column name), the engine sends the error back to the LLM for a corrected query
- **Result truncation**: Responses are capped at 50 rows

---

## Design Decisions

### Why SQLite?
- Zero installation/setup — the DB is a single file
- Perfect for a self-contained assessment submission
- The schema is portable SQL that maps naturally to SQLite
- Read-only mode provides a simple safety guarantee

### Why Gemini (gemini-2.0-flash)?
- Free tier with generous rate limits
- Fast inference (~1-3s per call)
- Strong SQL generation capabilities
- No credit card required — just an API key from Google AI Studio

### Why two LLM passes instead of one?
- **Separation of concerns**: SQL generation requires strict, structured output; answer formatting requires creative prose. Different system prompts optimize for each.
- **Transparency**: The SQL query is shown to the user as "reasoning", satisfying the assessment requirement to "show your reasoning, somewhere visible."
- **Debuggability**: If an answer is wrong, you can inspect the SQL to see where it went wrong.

### Schema modifications
I added two **summary views** to the schema to help the LLM with common query patterns:
- `bed_summary` — pre-aggregates bed counts by ward and status, including occupancy percentages
- `staff_coverage` — computes utilization percentage and staffing adequacy status

These views act as a form of "schema hint" — the LLM can query them directly for common questions instead of writing complex JOINs, improving both speed and accuracy.

---

## What I'd Improve With More Time

1. **Few-shot examples in the prompt**: Include the example Q&A pairs as few-shot examples in the SQL generation prompt to improve accuracy on known question patterns.

2. **Embedding-based retrieval**: For a larger schema, use embeddings to retrieve only the relevant table definitions instead of stuffing the entire schema into context.

3. **Query plan validation**: Before executing, use `EXPLAIN QUERY PLAN` to sanity-check that the generated SQL accesses expected tables.

4. **Caching**: Cache common questions and their SQL to avoid redundant LLM calls.

5. **WebSocket streaming**: Stream the LLM's answer token-by-token for a better UX.

6. **Integration with Part 1 widget**: Embed the "Ask" input directly into the Hospilot widget panel as a second tab.

7. **Multi-turn conversation**: Use LLM context to handle follow-up questions like "break that down by ward" after asking "how many beds are occupied?"

---

## File Structure

```
rag/Neeraj/
├── app.py              # FastAPI application (endpoints)
├── rag_engine.py       # Core RAG pipeline (SQL gen + execution + answer)
├── schema.sql          # SQLite-compatible database schema
├── seed_data.py        # Generates realistic sample data
├── requirements.txt    # Python dependencies
├── .env.example        # Environment variable template
├── README.md           # This file
├── hospilot.db         # SQLite database (generated by seed_data.py)
└── templates/
    └── index.html      # Web UI
```
