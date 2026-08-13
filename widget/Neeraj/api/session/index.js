'use strict';

const { handleCreateSession } = require('../../lib/handlers');

module.exports = async function sessionCreate(req, res) {
  return handleCreateSession(req, res);
};
