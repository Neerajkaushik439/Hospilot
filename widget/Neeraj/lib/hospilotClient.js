'use strict';

const { getConfig, assertCredentials } = require('./config');
const { AppError, mapUpstreamStatus } = require('./errors');
const { log } = require('./logger');
const { withCandidatePrefix } = require('./validate');

/**
 * Reusable Hospilot API client.
 * All Hospilot HTTP calls go through this module.
 */

async function fetchWithTimeout(url, options = {}, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AppError(
        'REQUEST_TIMEOUT',
        'The Hospilot request timed out. Please try again.',
        504
      );
    }
    throw new AppError(
      'NETWORK_ERROR',
      'Unable to reach Hospilot. Please check your connection and try again.',
      502
    );
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function createHospilotClient(overrides = {}) {
  const config = { ...getConfig(), ...overrides };

  async function login() {
    assertCredentials(config);
    log('LOGIN_START');

    const response = await fetchWithTimeout(
      `${config.hospilotBaseUrl}/api/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: config.hospilotUsername,
          password: config.hospilotPassword,
        }),
      },
      config.requestTimeoutMs
    );

    const data = await parseJsonSafe(response);

    if (!response.ok) {
      log('LOGIN_FAILED', { status: response.status });
      if (response.status === 401 || response.status === 403) {
        throw new AppError(
          'AUTH_FAILED',
          'Unable to authenticate with Hospilot. Please check server credentials.',
          response.status
        );
      }
      throw mapUpstreamStatus(response.status, 'Login to Hospilot failed.');
    }

    if (!data || typeof data.token !== 'string' || !data.token) {
      log('LOGIN_MALFORMED');
      throw new AppError(
        'MALFORMED_RESPONSE',
        'Received an unexpected response from Hospilot login.',
        502
      );
    }

    log('LOGIN_SUCCESS');
    return { token: data.token, user: data.user || null };
  }

  async function createSession(token, goal) {
    if (!token || typeof token !== 'string') {
      throw new AppError('AUTH_FAILED', 'Missing authentication token.', 401);
    }

    const prefixedGoal = withCandidatePrefix(goal, config);
    log('SESSION_CREATE_START', { goalLength: prefixedGoal.length });

    const response = await fetchWithTimeout(
      `${config.hospilotBaseUrl}/api/sessions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          goal: prefixedGoal,
          constraints: '',
          autonomous: false,
        }),
      },
      config.requestTimeoutMs
    );

    const data = await parseJsonSafe(response);

    if (!response.ok) {
      log('SESSION_CREATE_FAILED', { status: response.status });
      throw mapUpstreamStatus(response.status, 'Unable to create the Hospilot session.');
    }

    const sessionId = data && (data.session_id || data.sessionId || data.id);
    if (!sessionId || typeof sessionId !== 'string') {
      log('SESSION_CREATE_MALFORMED');
      throw new AppError(
        'MALFORMED_RESPONSE',
        'Received an unexpected response when creating a session.',
        502
      );
    }

    // Enforce assessment contract: we always send autonomous:false
    if (data.autonomous === true) {
      log('SESSION_AUTONOMOUS_UNEXPECTED', { sessionId });
    }

    log('SESSION_CREATE_SUCCESS', { sessionId, status: data.status || 'planning' });
    return {
      sessionId,
      status: data.status || 'planning',
      autonomous: data.autonomous === true ? true : false,
      raw: data,
      goal: prefixedGoal,
    };
  }

  async function getSession(token, sessionId) {
    if (!token || typeof token !== 'string') {
      throw new AppError('AUTH_FAILED', 'Missing authentication token.', 401);
    }
    if (!sessionId || typeof sessionId !== 'string') {
      throw new AppError('INVALID_SESSION', 'A valid session ID is required.', 400);
    }

    const response = await fetchWithTimeout(
      `${config.hospilotBaseUrl}/api/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      config.requestTimeoutMs
    );

    const data = await parseJsonSafe(response);

    if (!response.ok) {
      log('SESSION_GET_FAILED', { sessionId, status: response.status });
      if (response.status === 404) {
        throw new AppError('SESSION_NOT_FOUND', 'That Hospilot session was not found.', 404);
      }
      throw mapUpstreamStatus(response.status, 'Unable to fetch the Hospilot session.');
    }

    if (!data || typeof data !== 'object') {
      log('SESSION_GET_MALFORMED', { sessionId });
      throw new AppError(
        'MALFORMED_RESPONSE',
        'Received an unexpected response when polling the session.',
        502
      );
    }

    return data;
  }

  return {
    login,
    createSession,
    getSession,
    config,
  };
}

module.exports = { createHospilotClient, fetchWithTimeout };
