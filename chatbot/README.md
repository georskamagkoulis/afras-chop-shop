# "Ρώτα μας": demo chatbot for Afra's Chop Shop

A small AI assistant that answers visitors' questions (hours, prices, address, "are you open now?")
**only from `data/site.json`**, using Claude. It is a demo: it is **not** part of the live website
and is not published by the website's GitHub Action.

```
demo page (browser) ──POST /chat──▶ worker (Cloudflare) ──▶ Claude API
                                     │  keeps the API key secret
                                     │  checks every request (website, length, size)
                                     └─ facts from data/site.json, "open now" from js/hours.js
```

## Files

| File | What it does |
|---|---|
| `src/knowledge.mjs` | Turns `site.json` into the facts and rules for the AI; works out the time in Greece and "Ανοιχτά / Κλειστά" with the website's own `js/hours.js` |
| `src/chat.mjs` | Sends the conversation to Claude and reads the answer as JSON: `{ answer, action }` |
| `src/handler.mjs` | The `/chat` endpoint: allowed websites only, at most 10 messages of 500 characters, errors become "call us" |
| `src/worker.mjs` | Entry point on Cloudflare Workers |
| `src/mock-client.mjs`, `scripts/mock-server.mjs` | Mock mode: the demo without an API key (`npm run dev:mock`) |
| `demo/` | The chat page (`index.html`, `demo.js`, `demo.css`) |
| `test/` | Tests with a **fake** Claude: no key, no cost (`npm test`) |
| `evals/` | Questions for the **real** Claude and what the answers must contain (`npm run evals`) |

## How it stays safe

- **The API key is a secret.** It lives only in Cloudflare (or in `.dev.vars` on your computer, which
  git ignores). Never in the code, in `site.json`, or in the browser.
- **Answers only from the facts.** Unknown things (other services, parking, payment) → "I don't know,
  call us" with a phone button. It never books appointments; it links to Setmore.
- **"Open now" is computed in code**, not guessed by the AI.
- **Every request is checked** before it reaches the AI (allowed website, conversation size).
- **Spending limit**: set one in the Claude Console (below). That is the real protection against abuse,
  because anyone could call the worker directly.
- **The visitor is told it is an AI** (required by the EU AI Act) and not to share personal data.
- Answers are shown as plain text, never as HTML.

## Trying it without an API key (mock mode, free)

1. `cd chatbot`, then `npm install` (once).
2. Terminal 1, in `chatbot/`: `npm run dev:mock`
3. Terminal 2, in the repo root: `python3 -m http.server 8000` (on Windows without Python: `npx http-server -p 8000`)
4. Open http://localhost:8000/chatbot/demo/

The answers come from simple keyword rules over `site.json`, not from AI, and start with
"[Χωρίς AI]". Everything else is the real code: the same request checks, the same facts and the
same "Ανοιχτά / Κλειστά". Good for showing the page and working on its design for free.

## Setting it up (one time)

1. **Claude API key**: create an account at console.anthropic.com, add billing, create an API key.
   In the Console, set a **monthly spend limit** (e.g. a few euros for a demo).
2. **Install**: `cd chatbot` then `npm install`.
3. **Local key**: create the file `chatbot/.dev.vars` with one line:
   `ANTHROPIC_API_KEY=your-key` (git ignores this file).

## Running it on your computer

1. Terminal 1, in `chatbot/`: `npm run dev` (starts the worker at http://localhost:8787; the first time
   it downloads Wrangler, Cloudflare's tool).
2. Terminal 2, in the repo root: `python3 -m http.server 8000`
3. Open http://localhost:8000/chatbot/demo/ and ask something.

## Tests and evals

- `npm test`: tests with a fake Claude. Free; run them after every change.
- `ANTHROPIC_API_KEY=your-key npm run evals`: asks the **real** Claude the 33 questions in
  `evals/cases.json`, prints PASS/FAIL for each and the approximate cost (usually well under 1 dollar).
  Run it after every change to the prompt (`src/knowledge.mjs`) or the model, and compare.
- To compare models: `CHATBOT_MODEL=claude-sonnet-5-5 npm run evals` (or `claude-haiku-5-5`).
  Keep the cheapest one that passes the same questions. The default is `claude-opus-5-5`.
- When the bot gets something wrong, **first add that question to `cases.json`**, then fix the
  prompt, then run the evals again.

## Putting it online (Cloudflare Workers, free plan)

1. Create a Cloudflare account. In `chatbot/`: `npx wrangler login`.
2. Store the key as a secret: `npx wrangler secret put ANTHROPIC_API_KEY`.
3. In `wrangler.toml`, add the address of the page that will use the chatbot to `ALLOWED_ORIGINS`.
4. `npm run deploy`. Wrangler prints the worker's address, e.g. `https://afras-chatbot-demo.<you>.workers.dev`.
5. Open the demo page with `?api=https://afras-chatbot-demo.<you>.workers.dev/chat`.

The facts are copied into the worker when you deploy it, so **after changing `data/site.json`
(hours, prices, holidays) run `npm run deploy` again**.

If it is ever added to the real website, that page also needs `connect-src` for the worker's address
in its Content-Security-Policy, a line in the privacy page about the AI assistant, and the shop's OK.
