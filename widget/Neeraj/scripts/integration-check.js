'use strict';

/**
 * Controlled real integration check against Hospilot.
 * Creates ONE session, polls until ready, verifies contract.
 *
 * Usage:
 *   HOSPILOT_USERNAME=... HOSPILOT_PASSWORD=... node scripts/integration-check.js
 */

require('dotenv').config();

const { createHospilotClient } = require('../lib/hospilotClient');
const { isPlanReady } = require('../lib/validate');
const { getConfig } = require('../lib/config');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const config = getConfig();
  if (!config.hospilotUsername || !config.hospilotPassword) {
    console.error('Set HOSPILOT_USERNAME and HOSPILOT_PASSWORD before running integration check.');
    process.exit(1);
  }

  const client = createHospilotClient();
  console.log('1) Login…');
  const { token } = await client.login();
  if (!token) throw new Error('No token');

  console.log('2) Create session (autonomous=false, candidate prefix)…');
  const session = await client.createSession(token, 'Check ICU bed capacity for tonight');
  console.log('   sessionId:', session.sessionId);
  console.log('   goal:', session.goal);
  console.log('   autonomous:', session.autonomous);

  if (session.autonomous !== false) {
    throw new Error('autonomous must be false');
  }
  if (!session.goal.startsWith(config.candidatePrefix)) {
    throw new Error('candidate prefix missing');
  }

  console.log('3) Poll until pipeline ready…');
  const started = Date.now();
  let ready = false;
  let last = null;

  while (Date.now() - started < config.maxPollDurationMs) {
    last = await client.getSession(token, session.sessionId);
    ready = isPlanReady(last);
    console.log('   status=', last.status, 'ready=', ready);
    if (ready) break;
    await sleep(config.pollIntervalMs);
  }

  if (!ready) {
    console.error('FAIL: planning timed out');
    process.exit(2);
  }

  console.log('4) Ready. postMessage payload would be:');
  console.log(
    JSON.stringify(
      {
        type: 'widget_init',
        token: '<redacted>',
        sessionId: session.sessionId,
      },
      null,
      2
    )
  );

  console.log('SUCCESS — login, create, poll, ready detection all verified.');
  console.log('Open the UI and click View Plan to verify iframe + postMessage.');
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
