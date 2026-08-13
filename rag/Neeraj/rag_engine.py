"""
Core RAG engine: text-to-SQL generation + answer synthesis using Gemini.
"""

import sqlite3
import os
import re
import google.generativeai as genai

DB_PATH = os.path.join(os.path.dirname(__file__), "hospilot.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")

# Load schema text once at module level
_schema_text = None

def _get_schema_text():
    global _schema_text
    if _schema_text is None:
        with open(SCHEMA_PATH, "r") as f:
            _schema_text = f.read()
    return _schema_text


def _get_db():
    """Return a read-only SQLite connection."""
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


# ── Dangerous SQL patterns (write/DDL) ──────────────────────────────────────
_BLOCKED = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|ATTACH|DETACH|PRAGMA)\b",
    re.IGNORECASE,
)


def _validate_sql(sql: str) -> str | None:
    """Return an error message if the SQL is unsafe, else None."""
    if _BLOCKED.search(sql):
        return "Generated SQL contains a disallowed statement (write/DDL). Only SELECT queries are permitted."
    return None


# ── System prompts ──────────────────────────────────────────────────────────

SQL_SYSTEM_PROMPT = """You are a hospital database assistant. Your job is to convert
natural-language questions about hospital operations into a single SQLite SELECT query.

## Database Schema
{schema}

## Rules
1. Output ONLY the SQL query — no markdown fences, no explanation, no comments.
2. Use only tables and columns that exist in the schema above.
3. Use SQLite syntax (e.g. no ILIKE — use LIKE with case-insensitive matching).
4. For bed availability questions, the `beds` table has `status` values: 'available', 'occupied', 'maintenance', 'reserved'. Filter `is_active = 1` for active beds.
5. For staffing questions, use the `staff_roster` table. Shifts are 'morning', 'afternoon', 'night'. Compare `assigned_load` against `headcount * load_per_staff` to judge staffing adequacy.
6. For admission/IPD questions, use `ipd_admissions`. Status values include 'admitted', 'discharged', 'transferred', 'under_observation'.
7. For visit/OPD/ER questions, use `visits`. Status values include 'waiting', 'in_progress', 'completed', 'cancelled', 'no_show'.
8. There are two helpful views you can query directly: `bed_summary` and `staff_coverage`.
9. If the question CANNOT be answered from the schema (e.g. patient satisfaction, revenue targets, doctor ratings), respond with exactly: UNANSWERABLE
10. Always limit results to at most 50 rows unless the question specifically asks for everything.
11. Use COUNT, SUM, AVG, GROUP BY as needed to produce useful aggregates.
12. When the question is ambiguous, prefer a broad, useful summary over a narrow guess.
"""

ANSWER_SYSTEM_PROMPT = """You are a helpful hospital operations assistant. You have just
run a SQL query against the hospital database to answer a staff member's question.

## Your task
Given the original question, the SQL query that was run, and the raw results, produce
a clear, accurate, human-readable answer.

## Rules
1. Ground every claim in the actual data — never invent numbers.
2. Bold key numbers and ward/department names for readability.
3. If the results are empty, say so honestly — don't guess.
4. Add brief context or insights where helpful (e.g. "ICU is running at high occupancy").
5. Keep the answer concise but complete.
6. Use bullet points or numbered lists for multi-row results.
7. Do not show the SQL query in your answer — the user sees it separately.
"""

UNANSWERABLE_PROMPT = """You are a helpful hospital operations assistant. The user asked
a question that cannot be answered from the available hospital database schema.

The database contains: beds, departments, patients, admissions (IPD), visits (OPD/ER),
staff roster, vitals, lab orders/results, nursing tasks, OT surgeries, infection cases,
supplies/inventory, appointments, doctor slots, waitlist, claims, invoices, payments,
daily collections, and purchase orders.

Politely explain that you don't have access to the requested data, suggest where they
might find it, and offer to help with something you can answer.
Keep it concise — 3-5 sentences max.
"""


def configure_llm(api_key: str):
    """Configure the Gemini API client."""
    genai.configure(api_key=api_key)


def generate_sql(question: str) -> str:
    """Use LLM to convert a natural-language question into SQL."""
    schema = _get_schema_text()
    prompt = SQL_SYSTEM_PROMPT.format(schema=schema)

    model = genai.GenerativeModel("gemini-1.5-flash")
    response = model.generate_content(
        [
            {"role": "user", "parts": [prompt]},
            {"role": "user", "parts": [f"Question: {question}"]},
        ]
    )
    sql = response.text.strip()

    # Strip markdown fences if the model adds them despite instructions
    if sql.startswith("```"):
        lines = sql.split("\n")
        sql = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        sql = sql.strip()

    return sql


def execute_sql(sql: str) -> tuple[list[dict], str | None]:
    """Execute a SELECT query and return (rows, error_or_none)."""
    err = _validate_sql(sql)
    if err:
        return [], err

    try:
        conn = _get_db()
        cur = conn.execute(sql)
        columns = [desc[0] for desc in cur.description] if cur.description else []
        rows = [dict(zip(columns, row)) for row in cur.fetchall()]
        conn.close()
        return rows, None
    except Exception as e:
        return [], f"SQL execution error: {str(e)}"


def synthesize_answer(question: str, sql: str, results: list[dict]) -> str:
    """Use LLM to produce a human-readable answer from raw query results."""
    # Truncate results if too large
    display_results = results[:50]
    results_text = str(display_results) if display_results else "(no rows returned)"

    model = genai.GenerativeModel("gemini-1.5-flash")
    response = model.generate_content(
        [
            {"role": "user", "parts": [ANSWER_SYSTEM_PROMPT]},
            {"role": "user", "parts": [
                f"Original question: {question}\n\n"
                f"SQL query executed:\n{sql}\n\n"
                f"Raw results ({len(results)} rows):\n{results_text}"
            ]},
        ]
    )
    return response.text.strip()


def handle_unanswerable(question: str) -> str:
    """Generate a polite refusal for questions outside the schema."""
    model = genai.GenerativeModel("gemini-1.5-flash")
    response = model.generate_content(
        [
            {"role": "user", "parts": [UNANSWERABLE_PROMPT]},
            {"role": "user", "parts": [f"User's question: {question}"]},
        ]
    )
    return response.text.strip()


def ask(question: str) -> dict:
    """
    Full RAG pipeline:
      question → SQL generation → execution → answer synthesis

    Returns dict with keys: question, sql, results, answer, error
    """
    # Step 1: Generate SQL
    try:
        sql = generate_sql(question)
    except Exception as e:
        return {
            "question": question,
            "sql": None,
            "results": [],
            "answer": f"Failed to generate SQL: {str(e)}",
            "error": str(e),
        }

    # Step 2: Check if unanswerable
    if sql.strip().upper() == "UNANSWERABLE":
        answer = handle_unanswerable(question)
        return {
            "question": question,
            "sql": None,
            "results": [],
            "answer": answer,
            "error": None,
        }

    # Step 3: Execute SQL
    results, exec_err = execute_sql(sql)
    if exec_err:
        # If SQL failed, try once more with the error context
        try:
            retry_prompt = (
                f"The previous SQL query failed with error: {exec_err}\n"
                f"Original question: {question}\n"
                f"Failed SQL: {sql}\n\n"
                f"Please generate a corrected SQLite SELECT query. Output ONLY the SQL."
            )
            schema = _get_schema_text()
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = model.generate_content(
                [
                    {"role": "user", "parts": [SQL_SYSTEM_PROMPT.format(schema=schema)]},
                    {"role": "user", "parts": [retry_prompt]},
                ]
            )
            sql2 = response.text.strip()
            if sql2.startswith("```"):
                lines = sql2.split("\n")
                sql2 = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
                sql2 = sql2.strip()
            results, exec_err2 = execute_sql(sql2)
            if exec_err2:
                return {
                    "question": question,
                    "sql": sql,
                    "results": [],
                    "answer": f"I was unable to query the database. Error: {exec_err2}",
                    "error": exec_err2,
                }
            sql = sql2
        except Exception as e:
            return {
                "question": question,
                "sql": sql,
                "results": [],
                "answer": f"Failed to generate corrected SQL: {str(e)}",
                "error": str(e),
            }

    # Step 4: Synthesize answer
    try:
        answer = synthesize_answer(question, sql, results)
    except Exception as e:
        answer = f"Query returned {len(results)} rows but answer generation failed: {str(e)}"

    return {
        "question": question,
        "sql": sql,
        "results": results[:50],
        "answer": answer,
        "error": None,
    }
