/* IdeaToApps blog: prompt copy button, quiz feedback, remembered checklists, glossary tooltip.
 * Everything here only enhances markup that is already readable without JavaScript. */
(function () {
  'use strict';
  var doc = document;
  var uid = 0;

  function make(tag, cls, text) {
    var node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }
  function id(prefix) { uid += 1; return 'ita-js-' + prefix + '-' + uid; }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  /* Storage can throw (private mode, blocked cookies): every access is wrapped. */
  function load(key) {
    try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function save(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* not remembered */ }
  }

  /* Prompt: copy button */
  function legacyCopy(text) {
    var area = make('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    doc.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
    doc.body.removeChild(area);
    return ok;
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function initPrompt(box) {
    var pre = box.querySelector('.ita-prompt__text');
    if (!pre) return;
    var bar = make('div', 'ita-prompt__bar');
    var button = make('button', 'ita-btn', 'Copy prompt');
    button.type = 'button';
    var status = make('span', 'ita-prompt__status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    var timer = 0;
    button.addEventListener('click', function () {
      copyText(pre.textContent).then(function (ok) {
        status.textContent = ok ? 'Copied' : 'Copy failed. Select the text and copy it.';
        window.clearTimeout(timer);
        timer = window.setTimeout(function () { status.textContent = ''; }, 3000);
      });
    });
    bar.appendChild(button);
    bar.appendChild(status);
    box.appendChild(bar);
  }

  /* Quiz: radio buttons per scored question, a result each, a score at the end */
  function initQuestion(item, state, index) {
    var textEl = item.querySelector('.ita-q__text');
    var options = item.querySelectorAll('.ita-q__options > li');
    var reveal = item.querySelector('.ita-q__reveal');
    var correct = parseInt(item.getAttribute('data-correct'), 10);
    if (!textEl || !options.length || !correct || correct > options.length) return;
    var answerEl = reveal && reveal.querySelector('.ita-q__answer');
    var whyEl = reveal && reveal.querySelector('.ita-q__why');
    var set = make('fieldset', 'ita-q__set');
    var textId = id('q');
    textEl.id = textId;
    set.setAttribute('aria-labelledby', textId);
    var name = id('name');
    each(options, function (opt, i) {
      var label = make('label', 'ita-q__choice');
      var input = make('input');
      input.type = 'radio';
      input.name = name;
      input.value = String(i + 1);
      label.appendChild(input);
      label.appendChild(make('span', '', String.fromCharCode(65 + i) + '. ' + opt.textContent));
      set.appendChild(label);
    });
    var result = make('p', 'ita-q__result');
    result.setAttribute('aria-live', 'polite');
    item.querySelector('.ita-q__options').replaceWith(set);
    if (reveal) reveal.remove();
    item.appendChild(result);
    set.addEventListener('change', function (event) {
      var chosen = parseInt(event.target.value, 10);
      var right = chosen === correct;
      state.answers[index] = right;
      item.setAttribute('data-result', right ? 'correct' : 'wrong');
      result.textContent = (right ? 'Correct. ' : 'Not quite. The answer is ' + (answerEl ? answerEl.textContent : '') + '. ') + (whyEl ? whyEl.textContent : '');
      state.update();
    });
    state.total += 1;
  }
  function initQuiz(quiz) {
    var score = make('p', 'ita-quiz__score');
    score.setAttribute('aria-live', 'polite');
    var state = {
      total: 0,
      answers: {},
      update: function () {
        var done = Object.keys(state.answers).length;
        if (done < state.total) { score.textContent = ''; return; }
        var right = 0;
        Object.keys(state.answers).forEach(function (k) { if (state.answers[k]) right += 1; });
        score.textContent = 'Your score: ' + right + ' of ' + state.total + '.';
      },
    };
    each(quiz.querySelectorAll('.ita-q'), function (item, i) { initQuestion(item, state, i); });
    if (state.total) quiz.appendChild(score);
  }

  /* Checklist: checkboxes remembered per checklist id (and page) */
  function initChecklist(box) {
    var key = 'ita-checklist:' + window.location.pathname + ':' + box.getAttribute('data-ita-checklist');
    var saved = load(key);
    var checked = Array.isArray(saved) ? saved : [];
    var items = box.querySelectorAll('.ita-checklist__item');
    var status = make('p', 'ita-checklist__status');
    status.setAttribute('aria-live', 'polite');
    function refresh() {
      var done = 0;
      each(items, function (li) { if (li.querySelector('input').checked) done += 1; });
      status.textContent = done + ' of ' + items.length + ' done';
    }
    each(items, function (li, i) {
      var label = make('label', 'ita-checklist__label');
      var input = make('input');
      input.type = 'checkbox';
      input.checked = checked.indexOf(i) !== -1;
      label.appendChild(input);
      label.appendChild(make('span', '', li.textContent));
      li.textContent = '';
      li.appendChild(label);
      input.addEventListener('change', function () {
        var now = [];
        each(items, function (other, n) { if (other.querySelector('input').checked) now.push(n); });
        save(key, now);
        refresh();
      });
    });
    box.appendChild(status);
    refresh();
  }

  /* Glossary: tooltip on hover, focus and tap; Escape closes */
  function initTerms(terms) {
    var tip = make('span', 'ita-tip');
    tip.id = id('tip');
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    doc.body.appendChild(tip);
    var current = null;
    var openedAt = 0;
    function hide() {
      tip.hidden = true;
      current = null;
    }
    function show(term) {
      tip.textContent = term.getAttribute('data-define');
      tip.hidden = false;
      current = term;
      openedAt = Date.now();
      var rect = term.getBoundingClientRect();
      var width = tip.offsetWidth;
      var left = Math.max(8, Math.min(rect.left, doc.documentElement.clientWidth - width - 8));
      tip.style.left = left + window.pageXOffset + 'px';
      tip.style.top = rect.bottom + window.pageYOffset + 6 + 'px';
    }
    each(terms, function (term) {
      term.setAttribute('data-define', term.getAttribute('title'));
      term.removeAttribute('title'); // the tooltip replaces the native one
      term.setAttribute('aria-describedby', tip.id);
      term.addEventListener('mouseenter', function () { show(term); });
      term.addEventListener('mouseleave', hide);
      term.addEventListener('focus', function () { show(term); });
      term.addEventListener('blur', hide);
      term.addEventListener('click', function (event) {
        event.stopPropagation();
        if (current === term && Date.now() - openedAt > 400) hide(); else show(term);
      });
    });
    doc.addEventListener('click', hide);
    doc.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && current) hide();
    });
  }

  function init() {
    each(doc.querySelectorAll('[data-ita-prompt]'), initPrompt);
    each(doc.querySelectorAll('[data-ita-quiz]'), initQuiz);
    each(doc.querySelectorAll('[data-ita-checklist]'), initChecklist);
    var terms = doc.querySelectorAll('abbr.ita-term[title]');
    if (terms.length) initTerms(terms);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})();
