'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.CANDIDATE_NAME = 'neeraj';
process.env.HOSPILOT_USERNAME = 'test-user';
process.env.HOSPILOT_PASSWORD = 'test-pass';

const {
  validateGoal,
  withCandidatePrefix,
  isPlanReady,
  mapSessionStatus,
} = require('../lib/validate');
const { AppError } = require('../lib/errors');
const { getConfig } = require('../lib/config');

describe('validateGoal', () => {
  it('accepts a normal hospital goal', () => {
    assert.equal(validateGoal('Check ICU bed capacity for tonight'), 'Check ICU bed capacity for tonight');
  });

  it('trims whitespace', () => {
    assert.equal(validateGoal('  Hello world  '), 'Hello world');
  });

  it('rejects missing goal', () => {
    assert.throws(() => validateGoal(undefined), (err) => err instanceof AppError && err.status === 400);
  });

  it('rejects non-string', () => {
    assert.throws(() => validateGoal(42), (err) => err.code === 'INVALID_GOAL');
  });

  it('rejects empty / whitespace-only', () => {
    assert.throws(() => validateGoal('   '), (err) => err.code === 'INVALID_GOAL');
  });

  it('rejects oversized goal', () => {
    const huge = 'x'.repeat(getConfig().goalMaxLength + 1);
    assert.throws(() => validateGoal(huge), (err) => err.code === 'INVALID_GOAL');
  });

  it('accepts example goals', () => {
    const examples = [
      'Check ICU bed capacity for tonight',
      'Help me understand current bed availability',
      'Which wards have the highest occupancy?',
      'Check whether we have enough beds for an ED surge tonight',
      "Show me today's staffing situation",
    ];
    for (const g of examples) {
      assert.equal(validateGoal(g), g);
    }
  });
});

describe('withCandidatePrefix', () => {
  it('prefixes goals with candidate tag', () => {
    const out = withCandidatePrefix('Check ICU bed capacity for tonight');
    assert.equal(out, '[CANDIDATE-neeraj] Check ICU bed capacity for tonight');
  });

  it('does not double-prefix', () => {
    const already = '[CANDIDATE-neeraj] Check ICU';
    assert.equal(withCandidatePrefix(already), already);
  });
});

describe('isPlanReady', () => {
  it('detects non-empty pipeline array', () => {
    assert.equal(isPlanReady({ status: 'planning', pipeline: [{ id: 1 }] }), true);
  });

  it('detects empty pipeline as not ready', () => {
    assert.equal(isPlanReady({ status: 'planning', pipeline: [] }), false);
  });

  it('detects empty pipeline object scaffold as not ready', () => {
    assert.equal(isPlanReady({ status: 'pending', pipeline: { edges: [], agents: [] } }), false);
  });

  it('detects pipeline object with agents as ready', () => {
    assert.equal(
      isPlanReady({ status: 'pending', pipeline: { edges: [], agents: [{ id: 'icu_agent' }] } }),
      true
    );
  });

  it('detects ready status', () => {
    assert.equal(isPlanReady({ status: 'ready', pipeline: [] }), true);
  });

  it('handles null session', () => {
    assert.equal(isPlanReady(null), false);
  });
});

describe('mapSessionStatus', () => {
  it('maps ready', () => {
    assert.equal(mapSessionStatus({ status: 'planning' }, true), 'ready');
  });

  it('maps planning', () => {
    assert.equal(mapSessionStatus({ status: 'planning' }, false), 'planning');
  });

  it('maps failed', () => {
    assert.equal(mapSessionStatus({ status: 'failed' }, false), 'failed');
  });
});
