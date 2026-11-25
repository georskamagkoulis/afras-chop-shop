// run-evals.mjs: asks the REAL chatbot every question in cases.json and checks the answers.
//
// This calls the Claude API, so it costs money (a full run is usually well under 1 dollar)
// and needs an API key in the environment:
//   ANTHROPIC_API_KEY=... npm run evals
// Try another model:      CHATBOT_MODEL=claude-sonnet-5-5 npm run evals
// Run only some cases:     ONLY=6,7,8 npm run evals   (case numbers as printed)
//
// Run it after every change to the prompt or the model, and compare the score and the cost.

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { answerQuestion, DEFAULT_MODEL } from '../src/chat.mjs';

const site = JSON.parse(readFileSync(new URL('../../data/site.json', import.meta.url), 'utf8'));
const { defaultAt, cases } = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
const model = process.env.CHATBOT_MODEL || DEFAULT_MODEL;
const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;

// Price per million tokens (input, output) for an estimate of what the run cost.
// Check the current prices on Anthropic's pricing page; these may change.
const PRICES = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error('No API key. Run it like this:  ANTHROPIC_API_KEY=your-key npm run evals');
  process.exit(1);
}
const client = new Anthropic();   // reads ANTHROPIC_API_KEY from the environment
const lower = text => text.toLocaleLowerCase('el');

// Returns a list of problems with one answer (empty list = passed).
function check(testCase, result) {
  const text = lower(result.answer);
  const problems = [];
  for (const must of testCase.includesAll || []) {
    if (!text.includes(lower(must))) problems.push('missing "' + must + '"');
  }
  if (testCase.includesAny && !testCase.includesAny.some(t => text.includes(lower(t)))) {
    problems.push('none of ' + JSON.stringify(testCase.includesAny));
  }
  for (const not of testCase.excludes || []) {
    if (text.includes(lower(not))) problems.push('should not say "' + not + '"');
  }
  if (testCase.action && !testCase.action.includes(result.action)) {
    problems.push('button "' + result.action + '", expected ' + testCase.action.join(' or '));
  }
  return problems;
}

let passed = 0, run = 0;
const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
console.log('Model: ' + model + '\n');

for (let i = 0; i < cases.length; i++) {
  const number = i + 1;
  if (only && !only.includes(number)) continue;
  const testCase = cases[i];
  const caseSite = testCase.closures ? { ...site, closures: testCase.closures } : site;
  const date = new Date((testCase.at || defaultAt) + ':00+02:00');   // Greece is UTC+2 in Nov/Dec
  const history = [...(testCase.history || []), { role: 'user', content: testCase.q }];

  const result = await answerQuestion({ client, site: caseSite, history, date, model });
  const problems = check(testCase, result);
  run++;
  if (problems.length === 0) passed++;
  const u = result.usage || {};
  tokens.input += u.input_tokens || 0;
  tokens.output += u.output_tokens || 0;
  tokens.cacheRead += u.cache_read_input_tokens || 0;
  tokens.cacheWrite += u.cache_creation_input_tokens || 0;

  console.log((problems.length === 0 ? 'PASS ' : 'FAIL ') + number + '. ' + testCase.q);
  console.log('     → [' + result.action + '] ' + result.answer);
  if (problems.length) console.log('     ✗ ' + problems.join('; '));
}

console.log('\nScore: ' + passed + '/' + run);
const price = PRICES[model];
if (price) {
  // Cache reads cost about a tenth of normal input, cache writes about 1.25 times.
  const dollars = (tokens.input * price[0] + tokens.cacheRead * price[0] * 0.1 +
    tokens.cacheWrite * price[0] * 1.25 + tokens.output * price[1]) / 1e6;
  console.log('Tokens: ' + JSON.stringify(tokens) + '  ≈ $' + dollars.toFixed(3) + ' for this run');
}
process.exit(passed === run ? 0 : 1);
