'use strict';

/**
 * Central configuration for the Hospilot widget backend.
 * Credentials come only from environment variables.
 */

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function getConfig() {
  const candidateName = (process.env.CANDIDATE_NAME || 'neeraj').trim();

  return {
    hospilotBaseUrl: (process.env.HOSPILOT_BASE_URL || 'https://hospilot.carer.ai').replace(/\/$/, ''),
    hospilotUsername: process.env.HOSPILOT_USERNAME || '',
    hospilotPassword: process.env.HOSPILOT_PASSWORD || '',
    candidateName,
    candidatePrefix: `[CANDIDATE-${candidateName}]`,
    port: intEnv('PORT', 3000),
    pollIntervalMs: intEnv('POLL_INTERVAL_MS', 2500),
    maxPollDurationMs: intEnv('MAX_POLL_DURATION_MS', 90000),
    requestTimeoutMs: intEnv('REQUEST_TIMEOUT_MS', 15000),
    goalMinLength: 3,
    goalMaxLength: 2000,
  };
}

function assertCredentials(config = getConfig()) {
  if (!config.hospilotUsername || !config.hospilotPassword) {
    const err = new Error('Hospilot credentials are not configured');
    err.code = 'CONFIG_MISSING';
    err.status = 500;
    throw err;
  }
}

module.exports = { getConfig, assertCredentials };
