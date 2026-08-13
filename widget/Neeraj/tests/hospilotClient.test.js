'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');

process.env.CANDIDATE_NAME = 'neeraj';
process.env.HOSPILOT_USERNAME = 'test-user';
process.env.HOSPILOT_PASSWORD = 'test-pass';
process.env.HOSPILOT_BASE_URL = 'https://hospilot.example.test';
process.env.REQUEST_TIMEOUT_MS = '5000';

const { createHospilotClient } = require('../lib/hospilotClient');
const { AppError } = require('../lib/errors');

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

describe('hospilotClient', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mock.restoreAll();
  });

  it('login succeeds and returns token', async () => {
    global.fetch = async (url, opts) => {
      assert.match(url, /\/api\/auth\/login$/);
      assert.equal(opts.method, 'POST');
      const body = JSON.parse(opts.body);
      assert.equal(body.username, 'test-user');
      assert.equal(body.password, 'test-pass');
      return jsonResponse(200, { token: 'tok_abc', user: { username: 'test-user' } });
    };

    const client = createHospilotClient();
    const result = await client.login();
    assert.equal(result.token, 'tok_abc');
  });

  it('login failure maps to AUTH_FAILED', async () => {
    global.fetch = async () => jsonResponse(401, { error: 'nope' });
    const client = createHospilotClient();
    await assert.rejects(() => client.login(), (err) => err instanceof AppError && err.code === 'AUTH_FAILED');
  });

  it('createSession sends candidate prefix and autonomous:false', async () => {
    let captured;
    global.fetch = async (url, opts) => {
      captured = { url, opts };
      return jsonResponse(200, { session_id: 'sess-1', status: 'planning', autonomous: false });
    };

    const client = createHospilotClient();
    const session = await client.createSession('tok_abc', 'Check ICU bed capacity for tonight');

    assert.equal(session.sessionId, 'sess-1');
    assert.equal(session.autonomous, false);

    const body = JSON.parse(captured.opts.body);
    assert.equal(body.goal, '[CANDIDATE-neeraj] Check ICU bed capacity for tonight');
    assert.equal(body.autonomous, false);
    assert.equal(body.constraints, '');
    assert.equal(captured.opts.headers.Authorization, 'Bearer tok_abc');
  });

  it('createSession rejects malformed response', async () => {
    global.fetch = async () => jsonResponse(200, { status: 'planning' });
    const client = createHospilotClient();
    await assert.rejects(
      () => client.createSession('tok', 'Check beds'),
      (err) => err.code === 'MALFORMED_RESPONSE'
    );
  });

  it('getSession returns session payload', async () => {
    global.fetch = async (url, opts) => {
      assert.match(url, /\/api\/sessions\/sess-1$/);
      assert.equal(opts.headers.Authorization, 'Bearer tok');
      return jsonResponse(200, { session_id: 'sess-1', status: 'planning', pipeline: [] });
    };
    const client = createHospilotClient();
    const data = await client.getSession('tok', 'sess-1');
    assert.equal(data.status, 'planning');
  });

  it('getSession maps network failure', async () => {
    global.fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const client = createHospilotClient();
    await assert.rejects(
      () => client.getSession('tok', 'sess-1'),
      (err) => err.code === 'NETWORK_ERROR'
    );
  });

  it('login rejects malformed token response', async () => {
    global.fetch = async () => jsonResponse(200, { user: {} });
    const client = createHospilotClient();
    await assert.rejects(() => client.login(), (err) => err.code === 'MALFORMED_RESPONSE');
  });
});
