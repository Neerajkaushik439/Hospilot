'use strict';

const { AppError } = require('./errors');
const { getConfig } = require('./config');

/**
 * Validate and normalize a user goal. Does not apply the candidate prefix.
 */
function validateGoal(goal) {
  const config = getConfig();

  if (goal === undefined || goal === null) {
    throw new AppError('INVALID_GOAL', 'A goal is required.', 400);
  }
  if (typeof goal !== 'string') {
    throw new AppError('INVALID_GOAL', 'Goal must be a string.', 400);
  }

  const trimmed = goal.trim();
  if (!trimmed) {
    throw new AppError('INVALID_GOAL', 'Please enter a hospital operations goal.', 400);
  }
  if (trimmed.length < config.goalMinLength) {
    throw new AppError(
      'INVALID_GOAL',
      `Goal is too short. Please describe what you need in at least ${config.goalMinLength} characters.`,
      400
    );
  }
  if (trimmed.length > config.goalMaxLength) {
    throw new AppError(
      'INVALID_GOAL',
      `Goal is too long. Please keep it under ${config.goalMaxLength} characters.`,
      400
    );
  }

  return trimmed;
}

/**
 * Prefix the goal with [CANDIDATE-<name>] if not already present.
 */
function withCandidatePrefix(goal, config = getConfig()) {
  const trimmed = goal.trim();
  const prefix = config.candidatePrefix;
  if (trimmed.startsWith(prefix)) {
    return trimmed;
  }
  return `${prefix} ${trimmed}`;
}

function pipelineHasContent(pipeline) {
  if (!pipeline) return false;
  if (Array.isArray(pipeline)) return pipeline.length > 0;
  if (typeof pipeline !== 'object') return false;

  if (Array.isArray(pipeline.agents) && pipeline.agents.length > 0) return true;
  if (Array.isArray(pipeline.nodes) && pipeline.nodes.length > 0) return true;
  if (Array.isArray(pipeline.steps) && pipeline.steps.length > 0) return true;

  // Fallback: any nested array with items, ignoring empty scaffold keys
  for (const value of Object.values(pipeline)) {
    if (Array.isArray(value) && value.length > 0) return true;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = Object.values(value);
      if (nested.some((v) => Array.isArray(v) && v.length > 0)) return true;
    }
  }

  return false;
}

function isPlanReady(session) {
  if (!session || typeof session !== 'object') return false;

  if (pipelineHasContent(session.pipeline)) return true;
  if (pipelineHasContent(session.pipeline_snapshot)) return true;

  if (Array.isArray(session.stages) && session.stages.length > 0) return true;
  if (pipelineHasContent(session.plan)) return true;

  const status = String(session.status || '').toLowerCase();
  if (status === 'ready' || status === 'planned' || status === 'awaiting_approval') {
    return true;
  }

  return false;
}

function mapSessionStatus(session, ready) {
  if (!session) return 'failed';
  if (ready) return 'ready';
  const status = String(session.status || '').toLowerCase();
  if (status === 'failed' || status === 'error') return 'failed';
  if (status === 'timeout') return 'timeout';
  return 'planning';
}

module.exports = {
  validateGoal,
  withCandidatePrefix,
  isPlanReady,
  mapSessionStatus,
};
