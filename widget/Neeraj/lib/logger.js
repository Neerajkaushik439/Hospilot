'use strict';

/**
 * Structured server logs. Never log passwords, auth headers, or full tokens.
 */

function redact(value) {
  if (value == null) return value;
  if (typeof value === 'string' && value.length > 12) {
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
  }
  return value;
}

function log(event, meta = {}) {
  const safe = { ...meta };
  if ('token' in safe) safe.token = redact(safe.token);
  if ('password' in safe) delete safe.password;
  if ('authorization' in safe) delete safe.authorization;

  const line = {
    ts: new Date().toISOString(),
    event,
    ...safe,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line));
}

module.exports = { log, redact };
