// handler.mjs: receives a request from the chat page, checks it, and answers with JSON.
//
//   POST /chat   body: { "messages": [ { "role": "user", "content": "Είστε ανοιχτά;" } ] }
//   answer:          { "answer": "...", "action": "book" | "call" | "map" | "none", "link": "https://..." }
//
// Everything a visitor sends is checked here before anything reaches the AI, because each AI call
// costs money: only allowed websites, short messages, short conversations.

import Anthropic from '@anthropic-ai/sdk';
import { answerQuestion, fallbackAnswer } from './chat.mjs';
import { actionLinks } from './knowledge.mjs';

const MAX_MESSAGES = 10;        // a conversation of at most 10 messages (5 questions and 5 answers)
const MAX_MESSAGE_LENGTH = 500; // characters per message

// The answer to the browser, with the CORS header that lets the allowed website read it.
function json(body, status, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

// Returns an error message, or null if the conversation is acceptable.
export function checkMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 'messages must be a non-empty list';
  if (messages.length > MAX_MESSAGES) return 'at most ' + MAX_MESSAGES + ' messages';
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const expectedRole = i % 2 === 0 ? 'user' : 'assistant';   // user, assistant, user, ...
    if (!m || m.role !== expectedRole) return 'message ' + (i + 1) + ' should have role "' + expectedRole + '"';
    if (typeof m.content !== 'string' || m.content.trim() === '') return 'message ' + (i + 1) + ' is empty';
    if (m.content.length > MAX_MESSAGE_LENGTH) return 'message ' + (i + 1) + ' is longer than ' + MAX_MESSAGE_LENGTH + ' characters';
  }
  if (messages[messages.length - 1].role !== 'user') return 'the last message must be the visitor\'s question';
  return null;
}

// env.ALLOWED_ORIGINS: the websites allowed to use the chatbot, e.g. "http://localhost:8000,https://example.com"
export async function handleRequest(request, env, { client, site, date, model }) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin');
  if (!origin || !allowed.includes(origin)) {
    return json({ error: 'origin not allowed' }, 403, null);
  }

  // The browser first asks "may I send JSON here?" (a CORS "preflight"); we say yes.
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      },
    });
  }
  if (new URL(request.url).pathname !== '/chat') return json({ error: 'not found' }, 404, origin);
  if (request.method !== 'POST') return json({ error: 'use POST' }, 405, origin);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'the body must be JSON' }, 400, origin);
  }
  const problem = checkMessages(body && body.messages);
  if (problem) return json({ error: problem }, 400, origin);

  const history = body.messages.map(m => ({ role: m.role, content: m.content }));   // only the fields we expect
  const links = actionLinks(site);
  let result;
  try {
    result = await answerQuestion({ client, site, history, date, model });
  } catch (error) {
    // Most specific first: rate limit, then any other API error, then anything else (e.g. network).
    if (error instanceof Anthropic.RateLimitError) {
      console.error('Claude API rate limit:', error.message);
    } else if (error instanceof Anthropic.APIError) {
      console.error('Claude API error ' + error.status + ':', error.message);
    } else {
      console.error('Unexpected error:', error);
    }
    const fallback = fallbackAnswer(site);
    return json({ ...fallback, link: links[fallback.action] }, 502, origin);
  }
  return json({ answer: result.answer, action: result.action, link: links[result.action] || null }, 200, origin);
}
