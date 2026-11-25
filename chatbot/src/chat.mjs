// chat.mjs: sends one conversation to Claude and returns { answer, action }.
//
// The Anthropic client is passed in (instead of created here), so the tests can pass a fake one
// and run without an API key and without cost.

import { systemPrompt, athensNow, statusSentence } from './knowledge.mjs';

// Claude Opus 5.5 by default. You can try another model by setting CHATBOT_MODEL
// (for example in the evals), and keep whichever answers your eval questions best for its price.
export const DEFAULT_MODEL = 'claude-opus-5-5';

// The answer must be JSON in exactly this shape ("structured output"), so the page can
// show the text and the right button without guessing.
const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    action: { type: 'string', enum: ['book', 'call', 'map', 'none'] },
  },
  required: ['answer', 'action'],
  additionalProperties: false,
};

// What we show when the AI cannot give an answer (refusal, broken output, API down).
export function fallbackAnswer(site) {
  return {
    answer: 'Συγγνώμη, δεν μπορώ να απαντήσω σε αυτό εδώ. Πάρε μας τηλέφωνο στο ' + site.phone + '.',
    action: 'call',
  };
}

// history: [{ role: "user" | "assistant", content: "..." }, ...], ending with the visitor's question.
export async function answerQuestion({ client, site, history, date = new Date(), model = DEFAULT_MODEL }) {
  const now = athensNow(date);

  const request = {
    model,
    max_tokens: 4000,   // room for the model's (short) thinking plus a short answer
    // Short chat answers don't need deep thinking: "low" effort keeps them fast and cheap.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ANSWER_SCHEMA } },
    // The rules and facts. Marked for caching, so repeated questions reuse it at a lower price.
    system: [{ type: 'text', text: systemPrompt(site, now.date), cache_control: { type: 'ephemeral' } }],
    messages: [
      ...history,
      // The current time and status, computed in code (see knowledge.mjs), sent as a separate
      // system message after the question so the cached part above never changes.
      { role: 'system', content: 'Τώρα είναι ' + now.text + ' (ώρα Ελλάδας). Κατάσταση τώρα: ' + statusSentence(site, now) + '.' },
    ],
  };
  // If the model declines a request, the API can re-run it on a recommended fallback model.
  // Haiku models have no server-side fallback, so the option is only added for the others.
  if (!model.startsWith('claude-haiku')) {
    request.betas = ['server-side-fallback-2026-07-01'];
    request.fallbacks = 'default';
  }

  const response = await client.beta.messages.create(request);

  // A declined or cut-off answer has no usable JSON: show the phone number instead.
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
    return { ...fallbackAnswer(site), usage: response.usage, stop_reason: response.stop_reason };
  }
  const textBlock = response.content.find(block => block.type === 'text');
  try {
    const parsed = JSON.parse(textBlock.text);
    if (typeof parsed.answer !== 'string' || parsed.answer.trim() === '') throw new Error('empty answer');
    if (!['book', 'call', 'map', 'none'].includes(parsed.action)) throw new Error('unknown action');
    return { answer: parsed.answer.trim(), action: parsed.action, usage: response.usage, stop_reason: response.stop_reason };
  } catch {
    return { ...fallbackAnswer(site), usage: response.usage, stop_reason: response.stop_reason };
  }
}
