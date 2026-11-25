// mock-client.mjs: a stand-in for the Claude client, for trying the demo page WITHOUT an API key.
//
// It does not understand language: it looks for a few keywords and answers from site.json.
// Every answer starts with "[Χωρίς AI]" so nobody mistakes it for the real assistant.
// It has the same shape as the real client (client.beta.messages.create), so the rest of the
// code (handler.mjs, chat.mjs) runs exactly as it does with Claude.

import { DAYS, formatInterval } from '../../build-helpers.mjs';

// "Είστε ΑΝΟΙΧΤΆ;" -> "ειστε ανοιχτα;" (lower case, no accents), so keywords match more easily.
function simplify(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function reply(site, question, status) {
  const q = simplify(question);
  const has = (...words) => words.some(w => q.includes(w));
  const p = site.prices;

  if (has('ανοιχτ', 'ανοικτ', 'open', 'κλεινετε', 'κλειστ')) {
    return { answer: 'Τώρα: ' + status + '.', action: status.startsWith('Ανοιχτά') ? 'book' : 'none' };
  }
  if (has('ωραριο', 'ωρες', 'hours')) {
    const lines = DAYS.map(d => d.name + ' ' + (site.hours[d.key].length ? site.hours[d.key].map(formatInterval).join(', ') : 'κλειστά'));
    return { answer: 'Το ωράριο: ' + lines.join(' · ') + '.', action: 'none' };
  }
  if (has('γενι', 'beard') && has('κουρεμ', 'haircut')) {
    return { answer: p.combo.name + ': ' + p.combo.price + ' €.', action: 'book' };
  }
  if (has('γενι', 'beard')) return { answer: p.beard.name + ': ' + p.beard.price + ' €.', action: 'book' };
  if (has('κουρεμ', 'haircut', 'τιμ', 'κοστιζ', 'ποσο κανει', 'price')) {
    return { answer: p.haircut.name + ': ' + p.haircut.price + ' € (περίπου ' + p.haircut.minutes + ' λεπτά).', action: 'book' };
  }
  if (has('ραντεβου', 'κρατηση', 'κλεισω', 'book')) {
    return { answer: 'Μπορείς να κλείσεις ώρα online στο Setmore.', action: 'book' };
  }
  if (has('που ', 'που;', 'διευθυνση', 'βρισκεστε', 'where', 'address')) {
    const a = site.address;
    return { answer: 'Είμαστε στη ' + a.street + ', ' + a.postalCode + ' ' + a.city + ' (' + a.area + ').', action: 'map' };
  }
  if (has('τηλεφων', 'phone')) return { answer: 'Το τηλέφωνο είναι ' + site.phone + '.', action: 'call' };
  return { answer: 'Αυτό δεν το γνωρίζω. Πάρε μας τηλέφωνο στο ' + site.phone + '.', action: 'call' };
}

export function createMockClient(site) {
  return {
    beta: {
      messages: {
        async create(request) {
          const question = request.messages.filter(m => m.role === 'user').at(-1).content;
          // chat.mjs puts the computed "Ανοιχτά / Κλειστά" in the last (system) message.
          const status = request.messages.at(-1).content.split('Κατάσταση τώρα: ')[1].replace(/\.$/, '');
          const { answer, action } = reply(site, question, status);
          await new Promise(resolve => setTimeout(resolve, 300));   // a short pause, like a real reply
          return {
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: JSON.stringify({ answer: '[Χωρίς AI] ' + answer, action }) }],
            usage: { input_tokens: 0, output_tokens: 0 },
          };
        },
      },
    },
  };
}
