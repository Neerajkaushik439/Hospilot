'use strict';

const { handleGetSession } = require('../../lib/handlers');

module.exports = async function sessionGet(req, res) {
  const q = req.query || {};
  const id = typeof q.id === 'string' ? q.id : Array.isArray(q.id) ? q.id[0] : undefined;
  return handleGetSession(req, res, id);
};
