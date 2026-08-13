# Hospilot Widget — Part 1

Candidate: **neeraj**

A hospital dashboard widget that accepts a natural-language operations goal, creates a Hospilot planning session through a same-origin backend proxy, waits until the plan is ready, then opens the live Hospilot dashboard in an iframe with the exact `widget_init` postMessage handoff. Part 2 (RAG) is intentionally out of scope here.

## Architecture

```
Browser (demo.html + widget)
        │  same-origin HTTP
        ▼
Candidate Backend (/api/session)
        │  Authorization: Bearer <token>
        ▼
Hospilot API (https://hospilot.carer.ai)
```

Separate handoff path:

```
Browser
  → iframe src=https://hospilot.carer.ai
  → onload → postMessage({ type, token, sessionId })
```

Browser JavaScript never calls Hospilot `/api/auth/login` or `/api/sessions*` directly.

## Request Flow

1. User enters a goal (or picks an example) and clicks **Generate Plan**.
2. Backend authenticates with Hospilot using server-side credentials.
3. Backend creates a session with `autonomous: false` and a `[CANDIDATE-neeraj]` goal prefix.
4. Frontend polls `GET /api/session/:id` every ~2.5s until the plan/pipeline is ready (overall timeout applies).
5. UI enables **View Plan**.
6. Clicking **View Plan** shows the Hospilot iframe and waits for `iframe.onload`.
7. After load, the widget sends exactly:

```js
{ type: "widget_init", token, sessionId }
```

## Security

- Username/password live only in environment variables (never in frontend, git, or README values).
- All Hospilot API traffic is server-side.
- The iframe requires a token for `widget_init`, so the create-session response returns the token over HTTPS. The frontend keeps it in **runtime memory only** (not `localStorage`, cookies, or URL params).
- Passwords and full tokens are never logged.
- Responses use structured error codes without stack traces.

## Local Setup

```bash
cd widget/neeraj
cp .env.example .env
# edit .env — set HOSPILOT_USERNAME and HOSPILOT_PASSWORD
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Name | Required | Purpose |
|------|----------|---------|
| `HOSPILOT_USERNAME` | yes | Sandbox login username |
| `HOSPILOT_PASSWORD` | yes | Sandbox login password |
| `HOSPILOT_BASE_URL` | no | Defaults to `https://hospilot.carer.ai` |
| `CANDIDATE_NAME` | no | Defaults to `neeraj` (prefix `[CANDIDATE-…]`) |
| `PORT` | no | Local server port (default `3000`) |
| `POLL_INTERVAL_MS` | no | Frontend guidance / integration poll interval |
| `MAX_POLL_DURATION_MS` | no | Overall planning timeout |
| `REQUEST_TIMEOUT_MS` | no | Per-request Hospilot HTTP timeout |

## Backend API

### `POST /api/session`

```json
{ "goal": "Check ICU bed capacity for tonight" }
```

```json
{ "sessionId": "…", "status": "planning", "ready": false, "token": "…" }
```

### `GET /api/session/:sessionId`

Optional header: `X-Hospilot-Token` (avoids an extra login when the client already has the token).

```json
{ "sessionId": "…", "status": "planning|ready|failed|timeout", "ready": true }
```

## Deployment (Vercel)

1. Create a Vercel project with **Root Directory** set to `widget/neeraj`.
2. Add environment variables: `HOSPILOT_USERNAME`, `HOSPILOT_PASSWORD`, and optionally `CANDIDATE_NAME`.
3. Deploy.

```bash
cd widget/neeraj
npx vercel --prod
```

Or connect the GitHub fork in the Vercel dashboard and set the root directory to `widget/neeraj`.

After deploy, open the public URL and run the full flow once: example goal → Generate Plan → wait → View Plan → confirm the live plan appears.

## Testing

```bash
cd widget/neeraj
npm test
```

Coverage includes:

- Goal validation (empty, oversized, examples)
- Candidate prefix
- Login success/failure
- Session creation with `autonomous: false`
- Malformed upstream responses / network errors
- Poll ready detection
- postMessage exact shape

Controlled live check (creates **one** real sandbox session):

```bash
npm run integration
```

## Design Decisions

- **Backend proxy** — Hospilot rejects browser-origin CORS by design; a hospital backend is the real integration pattern.
- **Polling** — Matches the assessment guidance; WebSockets would be nicer but are not required.
- **Frontend state machine** — Prevents race conditions (double submit, View Plan before ready, duplicate postMessage).
- **Runtime token** — Needed for iframe init; kept ephemeral in memory rather than persisted storage.
- **Centralized `CANDIDATE_NAME`** — One config change updates the goal prefix everywhere.

## Tradeoffs

- Serverless cold starts can add a little latency on first request after idle.
- Polling is simpler than WebSockets but slightly less snappy.
- Returning a token to the browser is required by the iframe contract; we minimize exposure by never persisting it client-side.

## Future Improvements

- WebSocket-based plan readiness updates
- Stronger observability / request IDs
- Session expiration handling and token refresh
- Origin-validated iframe communication (if Hospilot supports a reply handshake)

## Reviewer quick path

1. Open the deployed URL (or `http://localhost:3000`).
2. Use the default goal or click an example.
3. Click **Generate Plan** and wait for **Plan ready**.
4. Click **View Plan** and confirm the Hospilot dashboard shows that session.
