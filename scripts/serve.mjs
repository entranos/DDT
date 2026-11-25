// Minimal static file server for local development: `npm start`, then open
// http://localhost:8080. The editors need no build step; any static
// host (GitHub Pages, nginx, …) can serve this folder as is.

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const port = Number(process.env.PORT) || 8080
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x')
    const path = decodeURIComponent(url.pathname)
    let file = normalize(join(root, path))
    if (!file.startsWith(root)) { res.writeHead(403).end(); return }
    if ((await stat(file)).isDirectory()) {
      // Pages use relative links, so a folder's address must end in a slash.
      if (!path.endsWith('/')) { res.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end(); return }
      file = join(file, 'index.html')
    }
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' })
    res.end(body)
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
  }
}).listen(port, () => console.log(`Energy diagram tools: http://localhost:${port}`))
