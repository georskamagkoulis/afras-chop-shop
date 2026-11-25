// mock-server.mjs: runs the chatbot on your computer WITHOUT an API key and without cost.
//   npm run dev:mock      (inside chatbot/)
// It listens on http://localhost:8787 like "npm run dev", but answers come from mock-client.mjs
// (simple keyword rules, marked "[Χωρίς AI]") instead of Claude. Everything else is the real code:
// the same checks (handler.mjs), the same facts and "Ανοιχτά / Κλειστά" (knowledge.mjs).

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { handleRequest } from '../src/handler.mjs';
import { createMockClient } from '../src/mock-client.mjs';

const PORT = Number(process.env.PORT || 8787);
const env = { ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'http://localhost:8000' };
const site = JSON.parse(readFileSync(new URL('../../data/site.json', import.meta.url), 'utf8'));
const client = createMockClient(site);

http.createServer(async (req, res) => {
  // Turn Node's request into a standard web Request, which is what handleRequest expects
  // (it is also what Cloudflare gives the real worker).
  let body = '';
  for await (const chunk of req) body += chunk;
  const request = new Request('http://localhost:' + PORT + req.url, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : body,
  });
  const response = await handleRequest(request, env, { client, site });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
}).listen(PORT, () => {
  console.log('Mock chatbot (no AI, no cost) on http://localhost:' + PORT + '/chat');
  console.log('Now, in the repo root:  python3 -m http.server 8000');
  console.log('and open:               http://localhost:8000/chatbot/demo/');
});
