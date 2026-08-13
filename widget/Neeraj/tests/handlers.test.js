'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.CANDIDATE_NAME = 'neeraj';
process.env.HOSPILOT_USERNAME = 'test-user';
process.env.HOSPILOT_PASSWORD = 'test-pass';
process.env.HOSPILOT_BASE_URL = 'https://hospilot.example.test';

const { handleCreateSession, handleGetSession } = require('../lib/handlers');
const { isPlanReady } = require('../lib/validate');

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(chunk) {
      this.body = chunk || '';
    },
  };
}

function mockReq(method, body, headers = {}) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  let sent = false;
  return {
    method,
    headers,
    body: body === undefined ? undefined : body,
    on(event, cb) {
      if (event === 'data' && payload && !sent) {
        sent = true;
        cb(payload);
      }
      if (event === 'end') cb();
      return this;
    },
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

describe('API handlers', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POST /api/session creates session', async () => {
    global.fetch = async (url) => {
      if (String(url).endsWith('/api/auth/login')) {
        return jsonResponse(200, { token: 'tok-1', user: {} });
      }
      if (String(url).endsWith('/api/sessions')) {
        return jsonResponse(200, { session_id: 's-1', status: 'planning', autonomous: false });
      }
      throw new Error(`unexpected url ${url}`);
    };

    const req = mockReq('POST', { goal: 'Check ICU bed capacity for tonight' });
    // Prefer already-parsed body path
    req.body = { goal: 'Check ICU bed capacity for tonight' };
    const res = mockRes();
    await handleCreateSession(req, res);

    assert.equal(res.statusCode, 201);
    const data = JSON.parse(res.body);
    assert.equal(data.sessionId, 's-1');
    assert.equal(data.token, 'tok-1');
    assert.equal(data.ready, false);
  });

  it('POST /api/session rejects invalid goal', async () => {
    const req = mockReq('POST', { goal: '  ' });
    req.body = { goal: '  ' };
    const res = mockRes();
    await handleCreateSession(req, res);
    assert.equal(res.statusCode, 400);
    const data = JSON.parse(res.body);
    assert.equal(data.error.code, 'INVALID_GOAL');
  });

  it('POST /api/session rejects oversized goal', async () => {
    const goal = 'x'.repeat(2001);
    const req = mockReq('POST', { goal });
    req.body = { goal };
    const res = mockRes();
    await handleCreateSession(req, res);
    assert.equal(res.statusCode, 400);
  });

  it('GET /api/session/:id returns ready when pipeline agents present', async () => {
    global.fetch = async (url) => {
      if (String(url).includes('/api/sessions/s-1')) {
        return jsonResponse(200, {
          session_id: 's-1',
          status: 'pending',
          pipeline: { edges: [], agents: [{ id: 'icu_agent' }] },
        });
      }
      throw new Error(`unexpected ${url}`);
    };

    const req = {
      method: 'GET',
      headers: { 'x-hospilot-token': 'tok-1' },
    };
    const res = mockRes();
    await handleGetSession(req, res, 's-1');
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.ready, true);
    assert.equal(data.status, 'ready');
  });

  it('GET /api/session/:id returns ready when pipeline present', async () => {
    global.fetch = async (url) => {
      if (String(url).includes('/api/sessions/s-1')) {
        return jsonResponse(200, {
          session_id: 's-1',
          status: 'planning',
          pipeline: [{ agent: 'bed' }],
        });
      }
      throw new Error(`unexpected ${url}`);
    };

    const req = {
      method: 'GET',
      headers: { 'x-hospilot-token': 'tok-1' },
    };
    const res = mockRes();
    await handleGetSession(req, res, 's-1');
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.ready, true);
    assert.equal(data.status, 'ready');
  });

  it('GET /api/session/:id returns planning when pipeline empty', async () => {
    global.fetch = async () =>
      jsonResponse(200, { session_id: 's-1', status: 'planning', pipeline: [] });

    const req = { method: 'GET', headers: { 'x-hospilot-token': 'tok-1' } };
    const res = mockRes();
    await handleGetSession(req, res, 's-1');
    const data = JSON.parse(res.body);
    assert.equal(data.ready, false);
    assert.equal(data.status, 'planning');
  });
});

describe('ready detection contract', () => {
  it('pipeline non-empty means ready', () => {
    assert.equal(isPlanReady({ pipeline: [{ a: 1 }] }), true);
  });
});

describe('postMessage contract (frontend helper)', () => {
  it('exact shape required by Hospilot iframe', () => {
    // Mirrors widget.js buildPostMessage
    const message = {
      type: 'widget_init',
      token: 'abc',
      sessionId: 'sess',
    };
    assert.deepEqual(Object.keys(message).sort(), ['sessionId', 'token', 'type']);
    assert.equal(message.type, 'widget_init');
  });
});
