#!/usr/bin/env python3
"""Generate Hospilot Part 1 implementation + interview Q&A PDF."""

from pathlib import Path
from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "Hospilot_Part1_Implementation_Interview_QnA.pdf"
NAME_FILE = ROOT / "PDF_DOCUMENT_NAME.txt"


class PDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 100, 100)
        self.cell(
            0,
            6,
            "Hospilot Part 1 - Implementation Plan & Interview Q&A | Candidate: neeraj",
            align="L",
        )
        self.ln(8)

    def footer(self):
        self.set_y(-12)
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, f"Page {self.page_no()}/{{nb}}", align="C")

    def _reset_x(self):
        self.set_x(self.l_margin)

    def h1(self, text):
        self._reset_x()
        self.set_font("Helvetica", "B", 18)
        self.set_text_color(15, 23, 42)
        self.multi_cell(0, 9, text)
        self.ln(2)

    def h2(self, text):
        self.ln(3)
        self._reset_x()
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(13, 110, 110)
        self.multi_cell(0, 7, text)
        self.ln(1)

    def h3(self, text):
        self.ln(2)
        self._reset_x()
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(30, 41, 59)
        self.multi_cell(0, 6, text)
        self.ln(0.5)

    def body(self, text):
        self._reset_x()
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 41, 59)
        self.multi_cell(0, 5.2, text)
        self.ln(1)

    def bullet(self, text):
        self._reset_x()
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 41, 59)
        self.multi_cell(0, 5.2, f"- {text}")

    def q(self, text):
        self.ln(2)
        if self.get_y() > 250:
            self.add_page()
        self._reset_x()
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(15, 23, 42)
        self.multi_cell(0, 5.2, f"Q: {text}")

    def a(self, text):
        self._reset_x()
        self.set_font("Helvetica", "", 10)
        self.set_text_color(51, 65, 85)
        self.multi_cell(0, 5.2, f"A: {text}")
        self.ln(0.5)

    def code(self, text):
        self._reset_x()
        self.set_font("Courier", "", 8.5)
        self.set_text_color(30, 41, 59)
        self.set_fill_color(241, 245, 249)
        self.multi_cell(0, 4.5, text, fill=True)
        self.ln(1)


def build():
    pdf = PDF(format="A4")
    pdf.set_margins(16, 16, 16)
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()

    pdf.h1("Hospilot Full-Stack Assessment")
    pdf.h2("Part 1 - Implementation Plan & Interview Q&A")
    pdf.body("Candidate folder: widget/neeraj/")
    pdf.body("Document name: Hospilot_Part1_Implementation_Interview_QnA.pdf")
    pdf.body(
        "Purpose: Explain how Part 1 was built, what technologies were used, "
        "the architecture and request flow, and prepare interview-style answers "
        "a reviewer or hiring manager might ask."
    )
    pdf.body("Scope: Part 1 only (Widget + Live Plan Viewer). Part 2 / RAG is out of scope.")

    pdf.h2("1. Implementation Plan (How I Built It)")
    pdf.body(
        "I followed the assessment contract in order: inspect the repo first, "
        "copy demo.html into a candidate folder, build a backend proxy, wire the "
        "frontend widget, harden iframe postMessage, add tests, then prepare deployment."
    )

    steps = [
        "Inspect repo: widget/demo.html, README, .gitignore, assessment instructions.",
        "Create widget/neeraj/ and copy demo.html (never edit the original demo in place).",
        "Centralize CANDIDATE_NAME so every goal is prefixed [CANDIDATE-neeraj].",
        "Build reusable Hospilot client: login, createSession, getSession.",
        "Expose same-origin APIs: POST /api/session and GET /api/session/:id.",
        "Validate goals server-side (trim, min/max length, reject empty/oversized).",
        "Always create sessions with autonomous: false.",
        "Frontend state machine: IDLE -> SUBMITTING -> PLANNING -> READY -> LOADING_IFRAME -> VIEWING_PLAN / ERROR.",
        "Poll until pipeline.agents is non-empty (or timeout).",
        "View Plan opens iframe to https://hospilot.carer.ai, waits for load, then postMessage widget_init.",
        "Retry postMessage because Hospilot is an SPA and onload can fire before its listener is ready.",
        "Add unit tests with mocked fetch + one controlled live integration check.",
        "Prepare Vercel deployment (api/ serverless + static demo.html) and document env vars.",
    ]
    for i, s in enumerate(steps, 1):
        pdf.bullet(f"Step {i}: {s}")

    pdf.h2("2. Things Used (Tech Stack & Tools)")
    pdf.h3("Languages & runtime")
    pdf.bullet("JavaScript (Node.js >= 18) for backend and local server")
    pdf.bullet("Vanilla HTML / CSS / JS for the widget (no React/Vue)")
    pdf.bullet("Python fpdf2 only to generate this interview PDF (not part of runtime)")

    pdf.h3("Libraries")
    pdf.bullet("dotenv - load credentials locally from .env")
    pdf.bullet("Node built-in http + fetch - no Express required")
    pdf.bullet("node:test + node:assert - zero-config unit tests")

    pdf.h3("External systems")
    pdf.bullet("Hospilot API: https://hospilot.carer.ai")
    pdf.bullet("POST /api/auth/login")
    pdf.bullet("POST /api/sessions (goal, constraints, autonomous:false)")
    pdf.bullet("GET /api/sessions/{session_id}")
    pdf.bullet("Hospilot web app in iframe + window.postMessage handoff")

    pdf.h3("Deployment target")
    pdf.bullet("Vercel: static frontend + /api serverless functions")
    pdf.bullet("Platform environment variables (never commit secrets)")

    pdf.h3("Key files")
    for f in [
        "demo.html - CarePlus HIS mock dashboard with widget wired in",
        "widget.js / widget.css - UI, state machine, iframe handoff",
        "server.js - local same-origin server",
        "api/session/index.js + api/session/[id].js - Vercel routes",
        "lib/hospilotClient.js - centralized upstream API client",
        "lib/handlers.js - request validation + response shaping",
        "lib/validate.js - goal rules + pipeline readiness detection",
        "tests/*.test.js - mocked API / validation tests",
        "scripts/integration-check.js - one real sandbox session check",
        "README.md - architecture, setup, security, tradeoffs",
    ]:
        pdf.bullet(f)

    pdf.add_page()
    pdf.h2("3. Architecture")
    pdf.body("Two separate paths exist on purpose:")
    pdf.code(
        "Browser (widget)\n"
        "   |  same-origin HTTP\n"
        "   v\n"
        "Candidate Backend  (/api/session)\n"
        "   |  Authorization: Bearer <token>\n"
        "   v\n"
        "Hospilot API  (https://hospilot.carer.ai)\n"
        "\n"
        "AND separately:\n"
        "\n"
        "Browser\n"
        "   -> iframe src=https://hospilot.carer.ai\n"
        "   -> onload (+ short retries)\n"
        "   -> postMessage({ type: 'widget_init', token, sessionId })"
    )
    pdf.body(
        "Why split? Hospilot rejects browser-origin CORS for its API. "
        "A real hospital integration also keeps credentials and API access on the server. "
        "The browser only owns UI + the iframe handoff."
    )

    pdf.h2("4. Exact Request Flow (What Reviewers Check)")
    for i, item in enumerate(
        [
            "User types a natural-language goal.",
            "Frontend POST /api/session { goal } to OUR backend only.",
            "Backend logs into Hospilot with env credentials.",
            "Backend creates session with [CANDIDATE-neeraj] prefix and autonomous:false.",
            "Response returns sessionId + token (token kept in memory only).",
            "Frontend polls GET /api/session/:id every ~2.5s until ready=true.",
            "Ready means pipeline.agents is non-empty.",
            "UI enables View Plan.",
            "View Plan shows iframe, waits for load, sends exact postMessage shape.",
            "Iframe should show THAT session's plan - not an empty No Pipeline Yet screen.",
        ],
        1,
    ):
        pdf.bullet(f"{i}. {item}")

    pdf.h2("5. Security Decisions")
    pdf.bullet("Credentials only in env vars (.env locally, platform env in production).")
    pdf.bullet(".env is gitignored; never put username/password in HTML/JS/README.")
    pdf.bullet("Browser never calls Hospilot login/sessions APIs directly.")
    pdf.bullet("Token returned once for iframe init; runtime memory only.")
    pdf.bullet("Logs never include password, Authorization header, or full token.")
    pdf.bullet("API errors return structured JSON codes - no stack traces to users.")

    pdf.add_page()
    pdf.h2("6. Interview-Style Q&A (Full Prep)")

    qa = [
        (
            "Walk me through what you built for Part 1.",
            "I embedded a Hospilot workflow widget into a copied hospital HIS dashboard. "
            "The user enters a goal; my backend authenticates to Hospilot, creates a planning "
            "session with autonomous=false and a candidate prefix, polls until the pipeline is "
            "ready, then the UI opens the real Hospilot app in an iframe and initializes the "
            "exact session via postMessage.",
        ),
        (
            "Why didn't you call the Hospilot API from the browser?",
            "Two reasons: Hospilot CORS only allows known origins, so localhost browser calls "
            "fail by design; and real integrations keep credentials/API access on a trusted "
            "backend. The assessment explicitly requires a tiny backend proxy.",
        ),
        (
            "Where do credentials live?",
            "Only in environment variables: HOSPILOT_USERNAME and HOSPILOT_PASSWORD. "
            "Locally via .env (gitignored). In production via Vercel project settings. "
            "They are never committed and never sent to the frontend.",
        ),
        (
            "Why does the frontend still receive a token?",
            "Because the iframe handoff contract requires postMessage({ type:'widget_init', "
            "token, sessionId }). The token is required by Hospilot's UI to open the session. "
            "I return it only over HTTPS from our API and keep it in memory - not localStorage, "
            "cookies, or query params.",
        ),
        (
            "What is the exact postMessage contract?",
            "Exactly three fields: type: 'widget_init', token: '<jwt>', sessionId: '<uuid>'. "
            "No extra properties, no renamed keys. Sent only after iframe load (with retries "
            "because Hospilot is a SPA).",
        ),
        (
            "Why autonomous must be false?",
            "autonomous:true tells Hospilot to plan and immediately execute without human "
            "approval. This assessment is about planning/viewing the pipeline only, so we "
            "always send autonomous:false.",
        ),
        (
            "How do you know the plan is ready?",
            "I poll GET /api/sessions/{id}. Readiness is when pipeline has content - in practice "
            "pipeline is an object like { edges: [], agents: [...] }. Empty scaffold "
            "{agents:[]} is NOT ready. Status alone can stay 'pending' even after agents exist, "
            "so I key off pipeline.agents length.",
        ),
        (
            "How do you avoid creating too many sessions?",
            "Disable Generate Plan while SUBMITTING/PLANNING, ignore duplicate clicks in those "
            "states, and avoid auto-submit. Automated tests mock Hospilot. Only one controlled "
            "live integration script is used when needed.",
        ),
        (
            "Describe your frontend state machine.",
            "IDLE, SUBMITTING, PLANNING, READY, LOADING_IFRAME, VIEWING_PLAN, ERROR. "
            "View Plan is disabled until READY. Input is disabled while busy. ERROR shows a "
            "human message and Try again. This prevents contradictory UI and race conditions.",
        ),
        (
            "What went wrong with the first iframe test and how did you fix it?",
            "Auth worked (user appeared logged in) but the UI showed 'No Pipeline Yet'. "
            "Root cause: we briefly navigated the iframe to about:blank; onload fired too early "
            "and postMessage was marked sent before Hospilot's listener was ready. Fix: ignore "
            "about:blank loads and retry widget_init at 0/400/1000/2000/3500ms after real load.",
        ),
        (
            "How is the candidate name handled?",
            "CANDIDATE_NAME env/config defaults to neeraj. withCandidatePrefix() prepends "
            "[CANDIDATE-neeraj] unless already present. Centralized so it is easy to change.",
        ),
        (
            "How did you validate user input?",
            "Backend checks goal exists, is a string, trims whitespace, enforces min/max length "
            "(3..2000), rejects empty/whitespace and oversized payloads (body capped ~32KB). "
            "Natural language is not over-restricted.",
        ),
        (
            "What HTTP status codes does your API use?",
            "201 on session create; 400 invalid goal/JSON; 401/403 upstream auth issues; "
            "404 session not found; 413 payload too large; 429 rate limit; 502 upstream errors; "
            "504 request timeout. Errors look like { error: { code, message } }.",
        ),
        (
            "How do you handle polling timeouts and network failures?",
            "Per-request timeout (~15s) via AbortController. Overall planning timeout (~90s). "
            "Poll interval ~2.5s. Transient poll failures retry until overall timeout; auth "
            "failures fail fast. Offline event surfaces a clear UI error.",
        ),
        (
            "Why not WebSockets?",
            "Hospilot's real UI uses WebSockets, but the assessment says polling is fine. "
            "Polling is simpler, easier to test, and good enough for 10-30s planning. "
            "WebSockets would be a future improvement for snappier updates.",
        ),
        (
            "How would you deploy this?",
            "Set Vercel root directory to widget/neeraj, add env vars, deploy. "
            "Static demo.html + widget assets; /api/session and /api/session/:id as serverless "
            "functions. Same-origin requests, no permissive CORS needed.",
        ),
        (
            "How do you test without wasting sandbox compute?",
            "Unit tests mock global.fetch for login/create/poll/malformed/network cases. "
            "Frontend contract tests assert postMessage shape. One optional integration script "
            "creates a single real session when explicitly run.",
        ),
        (
            "What would you improve with more time?",
            "WebSocket readiness updates, stronger observability/request IDs, session expiration "
            "and token refresh, and a handshake reply from the iframe confirming session open.",
        ),
        (
            "If a reviewer opens your live URL, what should they do?",
            "Open the page, use the default/example goal, click Generate Plan, wait for Plan "
            "ready, click View Plan, and confirm the iframe shows the created pipeline - not "
            "an empty mission screen. That iframe step is the main Part 1 check.",
        ),
        (
            "Did you modify the original widget/demo.html?",
            "No. The assessment requires copying it into widget/<name>/ and building there. "
            "Original widget/demo.html stays untouched; only widget/neeraj/demo.html is customized.",
        ),
    ]

    for question, answer in qa:
        pdf.q(question)
        pdf.a(answer)

    pdf.add_page()
    pdf.h2("7. How To Run & Verify (Cheat Sheet)")
    pdf.h3("Local")
    pdf.code(
        "cd widget/neeraj\n"
        "cp .env.example .env   # set username/password\n"
        "npm install\n"
        "npm run dev           # http://localhost:3000\n"
        "npm test\n"
        "npm run integration   # optional; creates ONE real session"
    )
    pdf.h3("Manual reviewer path")
    pdf.bullet("Open http://localhost:3000 (or deployed URL)")
    pdf.bullet("Hard refresh if JS changed (Cmd+Shift+R)")
    pdf.bullet("Click example goal -> Generate Plan -> wait -> View Plan")
    pdf.bullet("Success = iframe shows your [CANDIDATE-neeraj] plan/pipeline")
    pdf.bullet("Failure pattern = logged in but 'No Pipeline Yet' (handoff/timing issue)")

    pdf.h2("8. Honest Tradeoffs")
    pdf.bullet("Vanilla JS kept Part 1 simple; a framework would help if the UI grew.")
    pdf.bullet("Polling is simpler than WebSockets but slightly less real-time.")
    pdf.bullet("Returning a token to the browser is required by iframe contract; exposure is minimized, not zero.")
    pdf.bullet("Serverless cold starts can add latency on first request after idle.")

    pdf.h2("9. One-Minute Closing Answer")
    pdf.body(
        "I treated this as a real hospital integration: credentials and Hospilot API calls "
        "stay on a same-origin backend, the widget owns UX and iframe handoff, sessions are "
        "created with autonomous=false and a candidate prefix, readiness is based on pipeline "
        "content with timeouts, and the critical demo path is View Plan opening the exact "
        "session via widget_init postMessage. I verified with mocked unit tests plus a "
        "controlled live integration, and fixed iframe SPA timing so the plan actually appears."
    )

    pdf.output(str(OUT))
    NAME_FILE.write_text(
        "PDF document name:\n"
        "Hospilot_Part1_Implementation_Interview_QnA.pdf\n\n"
        "Location:\n"
        "widget/neeraj/Hospilot_Part1_Implementation_Interview_QnA.pdf\n\n"
        "Contents:\n"
        "- Implementation plan (how Part 1 was built)\n"
        "- Tech stack / tools used\n"
        "- Architecture & request flow\n"
        "- Security decisions\n"
        "- Full interview-style Q&A\n"
        "- Run/verify cheat sheet\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUT}")
    print(f"Wrote {NAME_FILE}")


if __name__ == "__main__":
    build()
