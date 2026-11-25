/* Demo chat page: sends the conversation to the chatbot worker and shows the answers.
   The worker's address: ?api=... in the page URL, otherwise the local "wrangler dev" address. */
(function () {
  'use strict';

  var API = new URLSearchParams(location.search).get('api') || 'http://localhost:8787/chat';
  var MAX_MESSAGES = 10;            // the worker accepts at most 10 messages (5 questions, 5 answers)
  var BUTTON_TEXT = { book: 'Κλείσε ώρα', call: 'Πάρε τηλέφωνο', map: 'Οδηγίες στον χάρτη' };

  var log = document.querySelector('[data-chat-log]');
  var form = document.querySelector('[data-chat-form]');
  var input = form.querySelector('input');
  var sendButton = form.querySelector('button');
  var suggestions = document.querySelector('[data-suggestions]');
  var history = [];                 // [{ role: "user" | "assistant", content: "..." }, ...]

  // Adds one message bubble. Text is set with textContent, never as HTML, so an answer
  // can never put code on the page.
  function addMessage(role, text, action, link) {
    var bubble = document.createElement('div');
    bubble.className = 'chat__msg chat__msg--' + (role === 'user' ? 'user' : 'bot');
    var who = document.createElement('span');
    who.className = 'label chat__who';
    who.textContent = role === 'user' ? 'Εσύ' : 'Ψηφιακός βοηθός (AI)';
    var body = document.createElement('p');
    body.textContent = text;
    bubble.appendChild(who);
    bubble.appendChild(body);
    if (link && BUTTON_TEXT[action]) {
      var button = document.createElement('a');
      button.className = 'btn btn--line chat__action';
      button.href = link;
      button.textContent = BUTTON_TEXT[action];
      if (action !== 'call') { button.target = '_blank'; button.rel = 'noopener'; }
      bubble.appendChild(button);
    }
    log.appendChild(bubble);
    bubble.scrollIntoView({ block: 'nearest' });
    return bubble;
  }

  function setBusy(busy) {
    input.disabled = busy;
    sendButton.disabled = busy;
  }

  async function ask(question) {
    question = question.trim();
    if (question === '') return;
    if (history.length + 1 > MAX_MESSAGES) {
      addMessage('assistant', 'Η συζήτηση έφτασε το όριο. Ανανέωσε τη σελίδα για να ξεκινήσεις ξανά.');
      return;
    }
    suggestions.hidden = true;
    history.push({ role: 'user', content: question });
    addMessage('user', question);
    var waiting = addMessage('assistant', '…');
    waiting.classList.add('chat__msg--waiting');
    setBusy(true);
    try {
      var response = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      var data = await response.json();
      waiting.remove();
      if (!data.answer) throw new Error(data.error || 'no answer');
      history.push({ role: 'assistant', content: data.answer });
      addMessage('assistant', data.answer, data.action, data.link);
    } catch (error) {
      waiting.remove();
      history.pop();   // the question was not answered; let the visitor ask again
      addMessage('assistant', 'Κάτι πήγε στραβά με τη σύνδεση. Δοκίμασε ξανά σε λίγο ή πάρε τηλέφωνο.');
    }
    setBusy(false);
    input.focus();
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var question = input.value;
    input.value = '';
    ask(question);
  });
  suggestions.addEventListener('click', function (event) {
    if (event.target.matches('.chat-chip')) ask(event.target.textContent);
  });
})();
