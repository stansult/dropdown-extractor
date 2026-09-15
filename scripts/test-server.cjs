const http = require('node:http');
const { readFile } = require('node:fs');
const { extname, join, normalize } = require('node:path');

const root = join(__dirname, '..', 'test');
const port = Number(process.env.PORT || 4173);
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = normalize(join(root, relativePath));
  if (!file.startsWith(`${root}/`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  readFile(file, (error, contents) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    response.end(contents);
  });
}).listen(port, '127.0.0.1');
