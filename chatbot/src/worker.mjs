// worker.mjs: the entry point on Cloudflare Workers (see wrangler.toml).
//
// The API key is a Cloudflare "secret" (env.ANTHROPIC_API_KEY), set once with
//   npx wrangler secret put ANTHROPIC_API_KEY
// It never appears in the code, in git, or in the browser.

import Anthropic from '@anthropic-ai/sdk';
import site from '../../data/site.json' with { type: 'json' };
import { handleRequest } from './handler.mjs';

export default {
  async fetch(request, env) {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return handleRequest(request, env, { client, site, model: env.CHATBOT_MODEL || undefined });
  },
};
