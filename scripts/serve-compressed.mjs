#!/usr/bin/env node

/**
 * High-Performance Static Web Server with Brotli and Gzip HTTP Compression
 *
 * Serves DataCamp Light distribution files, documentation, and WebAssembly assets
 * with automatic content-encoding negotiation (Brotli -> Gzip -> Deflate -> Raw).
 *
 * Usage:
 *   node scripts/serve-compressed.mjs [--port=4173] [--host=localhost]
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDirectory = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const portArgument = args.find((arg) => arg.startsWith('--port='));
const hostArgument = args.find((arg) => arg.startsWith('--host='));
const PORT = portArgument ? parseInt(portArgument.split('=')[1], 10) : 4173;
const HOST = hostArgument ? hostArgument.split('=')[1] : '0.0.0.0';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.zip': 'application/zip',
  '.tar.gz': 'application/gzip',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const COMPRESSIBLE_TYPES = new Set([
  'text/html; charset=utf-8',
  'application/javascript; charset=utf-8',
  'text/css; charset=utf-8',
  'application/json; charset=utf-8',
  'application/wasm',
  'image/svg+xml',
  'text/plain; charset=utf-8',
]);

function findLocalFilePath(requestUrl) {
  const parsedUrl = new URL(requestUrl, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname === '/') {
    pathname = '/docs/index.html';
  }

  const candidatePaths = [
    path.join(rootDirectory, pathname),
    path.join(rootDirectory, 'dist', pathname),
    path.join(rootDirectory, 'public', pathname),
    path.join(rootDirectory, 'docs', pathname),
  ];

  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      return candidatePath;
    }
  }

  return null;
}

export function createCompressedServer() {
  return http.createServer((request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      });
      response.end();
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { 'Content-Type': 'text/plain' });
      response.end('Method Not Allowed');
      return;
    }

    const filePath = findLocalFilePath(request.url || '/');
    if (!filePath) {
      response.writeHead(404, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      });
      response.end(`404 Not Found: ${request.url}`);
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';
    const acceptEncoding = request.headers['accept-encoding'] || '';

    let rawBuffer;
    try {
      rawBuffer = fs.readFileSync(filePath);
    } catch (readError) {
      response.writeHead(500, { 'Content-Type': 'text/plain' });
      response.end('Internal Server Error');
      return;
    }

    const headers = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Vary': 'Accept-Encoding',
      'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
    };

    if (request.method === 'HEAD') {
      response.writeHead(200, headers);
      response.end();
      return;
    }

    const isCompressible = COMPRESSIBLE_TYPES.has(contentType) && rawBuffer.length >= 256;

    if (isCompressible && /\bbr\b/.test(acceptEncoding) && typeof zlib.brotliCompressSync === 'function') {
      const compressed = zlib.brotliCompressSync(rawBuffer, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
        },
      });
      headers['Content-Encoding'] = 'br';
      headers['Content-Length'] = String(compressed.length);
      response.writeHead(200, headers);
      response.end(compressed);
      return;
    }

    if (isCompressible && /\bgzip\b/.test(acceptEncoding)) {
      const compressed = zlib.gzipSync(rawBuffer, { level: 6 });
      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = String(compressed.length);
      response.writeHead(200, headers);
      response.end(compressed);
      return;
    }

    if (isCompressible && /\bdeflate\b/.test(acceptEncoding)) {
      const compressed = zlib.deflateSync(rawBuffer, { level: 6 });
      headers['Content-Encoding'] = 'deflate';
      headers['Content-Length'] = String(compressed.length);
      response.writeHead(200, headers);
      response.end(compressed);
      return;
    }

    headers['Content-Length'] = String(rawBuffer.length);
    response.writeHead(200, headers);
    response.end(rawBuffer);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = createCompressedServer();
  server.listen(PORT, HOST, () => {
    console.log(`\n======================================================================`);
    console.log(` DataCamp Light Compressed Server (Gzip & Brotli HTTP compression)`);
    console.log(` Serving at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(` Documentation: http://localhost:${PORT}/docs/index.html`);
    console.log(` Minimal Example: http://localhost:${PORT}/docs/example.html`);
    console.log(`======================================================================\n`);
  });
}
