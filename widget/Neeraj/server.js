'use strict';

/**
 * Local development server — serves demo.html and same-origin API routes.
 * Production uses Vercel serverless functions with the same handlers.
 */

require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('./lib/config');
const { handleCreateSession, handleGetSession, sendJson } = require('./lib/handlers');
const { log } = require('./lib/logger');

const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, {
        error: { code: 'NOT_FOUND', message: 'Not found.' },
      });
      return;
    }
    const ext = path.extname(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(data);
  });
}

function matchSessionGet(urlPath) {
  const m = urlPath.match(/^\/api\/session\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    if (pathname === '/api/session' || pathname === '/api/session/') {
      await handleCreateSession(req, res);
      return;
    }

    const sessionId = matchSessionGet(pathname);
    if (sessionId) {
      await handleGetSession(req, res, sessionId);
      return;
    }

    if (pathname === '/' || pathname === '/demo.html') {
      serveStatic(req, res, path.join(ROOT, 'public', 'demo.html'));
      return;
    }

    // Root static assets (widget.css / widget.js) + optional public/
    const safeRel = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
    const allowedRootFiles = new Set(['widget.css', 'widget.js', 'demo.html']);
    if (allowedRootFiles.has(safeRel)) {
      serveStatic(req, res, path.join(ROOT, 'public', safeRel));
      return;
    }

    const publicCandidate = path.join(ROOT, 'public', safeRel);
    if (
      publicCandidate.startsWith(path.join(ROOT, 'public')) &&
      fs.existsSync(publicCandidate) &&
      fs.statSync(publicCandidate).isFile()
    ) {
      serveStatic(req, res, publicCandidate);
      return;
    }

    sendJson(res, 404, {
      error: { code: 'NOT_FOUND', message: 'Not found.' },
    });
  } catch (err) {
    log('ERROR', { code: 'UNHANDLED', message: err.message });
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to process the request right now. Please try again.',
        },
      });
    }
  }
});

const config = getConfig();
server.listen(config.port, () => {
  log('SERVER_START', {
    port: config.port,
    candidate: config.candidateName,
    baseUrl: config.hospilotBaseUrl,
  });
  // eslint-disable-next-line no-console
  console.log(`Hospilot widget running at http://localhost:${config.port}`);
});
