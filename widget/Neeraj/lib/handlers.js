'use strict';

const { createHospilotClient } = require('./hospilotClient');
const { validateGoal, isPlanReady, mapSessionStatus } = require('./validate');
const { AppError, errorBody } = require('./errors');
const { log } = require('./logger');

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    // Vercel / some frameworks already parse JSON
    if (req.body !== undefined) {
      if (typeof req.body === 'string') {
        try {
          resolve(req.body ? JSON.parse(req.body) : {});
        } catch {
          reject(new AppError('INVALID_JSON', 'Request body must be valid JSON.', 400));
        }
        return;
      }
      if (typeof req.body === 'object' && req.body !== null) {
        resolve(req.body);
        return;
      }
    }

    const chunks = [];
    let size = 0;
    const MAX = 32 * 1024;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX) {
        reject(new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large.', 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new AppError('INVALID_JSON', 'Request body must be valid JSON.', 400));
      }
    });
    req.on('error', () => {
      reject(new AppError('NETWORK_ERROR', 'Failed to read request body.', 400));
    });
  });
}

function headerValue(req, name) {
  const raw = req.headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

/**
 * POST /api/session
 */
async function handleCreateSession(req, res) {
  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, {
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST to create a session.' },
      });
      return;
    }

    const body = await readJsonBody(req);
    const goal = validateGoal(body.goal);

    const client = createHospilotClient();
    const { token } = await client.login();
    const session = await client.createSession(token, goal);

    sendJson(res, 201, {
      sessionId: session.sessionId,
      status: session.status || 'planning',
      ready: false,
      // Required for iframe widget_init. Keep in frontend runtime memory only.
      token,
    });
  } catch (err) {
    log('ERROR', {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message,
      route: 'POST /api/session',
    });
    const status = err.status || 500;
    const body = errorBody(err);
    if (!(err instanceof AppError) || (status >= 500 && err.code === 'INTERNAL_ERROR')) {
      // Avoid leaking internals for unexpected errors
      if (!(err instanceof AppError)) {
        body.error.code = 'INTERNAL_ERROR';
        body.error.message = 'Unable to create the plan right now. Please try again.';
      }
    }
    sendJson(res, status, body);
  }
}

/**
 * GET /api/session/:sessionId
 */
async function handleGetSession(req, res, sessionId) {
  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, {
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET to poll a session.' },
      });
      return;
    }

    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new AppError('INVALID_SESSION', 'A valid session ID is required.', 400);
    }

    const client = createHospilotClient();
    let token = headerValue(req, 'x-hospilot-token');
    if (!token || typeof token !== 'string') {
      const login = await client.login();
      token = login.token;
    }

    log('POLL_START', { sessionId });
    const session = await client.getSession(token, sessionId.trim());
    const ready = isPlanReady(session);
    const status = mapSessionStatus(session, ready);

    if (ready) {
      log('POLL_READY', { sessionId });
    }

    sendJson(res, 200, {
      sessionId: sessionId.trim(),
      status,
      ready,
    });
  } catch (err) {
    log('ERROR', {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message,
      route: 'GET /api/session/:id',
      sessionId,
    });
    const status = err.status || 500;
    const body = errorBody(err);
    if (!(err instanceof AppError)) {
      body.error.code = 'INTERNAL_ERROR';
      body.error.message = 'Unable to check plan status right now. Please try again.';
    }
    sendJson(res, status, body);
  }
}

module.exports = {
  handleCreateSession,
  handleGetSession,
  sendJson,
  readJsonBody,
};
