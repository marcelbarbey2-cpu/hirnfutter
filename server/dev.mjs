// Lokaler Testserver: node server/dev.mjs  → http://localhost:8787 (Speicher nur im Arbeitsspeicher)
import http from 'node:http'
import worker from './worker.js'
const mem = new Map()
const env = { ADMIN_KEY: process.env.ADMIN_KEY || 'admin-test', ADMIN_NAME: 'Verwaltung (Test)',
  HF: { get: async k => mem.has(k) ? mem.get(k) : null, put: async (k, v) => { mem.set(k, v) }, delete: async k => { mem.delete(k) } } }
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const r = await worker.fetch(new Request('http://localhost:8787' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env)
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()))
}).listen(8787, () => console.log('Hirnfutter-Testserver auf http://localhost:8787'))
