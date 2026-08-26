// Servidor estatico + proxy, sem dependencias externas.
// Substitui o nginx.conf (ver arquivo) pra rodar sem Docker: mesmo
// comportamento -- index.html sempre sem cache (referencia arquivos com
// hash em /assets/, que sim podem ser cacheados "pra sempre"), e proxy de
// /api/* pra API rodando em API_PORT (default 3000).
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = process.env.API_PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function proxyToApi(req, res) {
  const proxyReq = http.request(
    {
      host: API_HOST,
      port: API_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on('error', (err) => {
    console.error('Erro no proxy para a api:', err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Nao foi possivel falar com a api (verifique se ela esta rodando)');
  });

  req.pipe(proxyReq, { end: true });
}

function serveStatic(req, res) {
  let filePath = decodeURIComponent(req.url.split('?')[0]);
  if (filePath === '/') filePath = '/index.html';

  const fullPath = path.join(DIST_DIR, filePath);

  // Nao deixar sair de dist/ (ex: ../../algo)
  if (!fullPath.startsWith(DIST_DIR)) {
    res.writeHead(400);
    return res.end('Bad request');
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      // SPA: qualquer rota nao encontrada cai no index.html (ex: /track/123)
      return fs.readFile(path.join(DIST_DIR, 'index.html'), (err2, indexData) => {
        if (err2) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        res.end(indexData);
      });
    }

    const ext = path.extname(fullPath);
    const headers = { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' };

    if (filePath === '/index.html') {
      headers['Cache-Control'] = 'no-cache';
    } else if (filePath.startsWith('/assets/')) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    }

    res.writeHead(200, headers);
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    return proxyToApi(req, res);
  }
  serveStatic(req, res);
});

server.on('upgrade', (req, socket, head) => {
  // Suporte a websocket, se a api algum dia usar (SSE nao precisa disso).
  socket.destroy();
});

server.listen(PORT, () => {
  console.log(`Frontend servindo em http://localhost:${PORT} (proxy /api/* -> http://${API_HOST}:${API_PORT})`);
});
