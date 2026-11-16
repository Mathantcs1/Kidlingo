/* IdeaToApps blog: quiz feedback and glossary tooltips (needs blog.js). */
(function () {
  'use strict';
  var Ita = window.ItaBlog;
  if (!Ita) return;
  var doc = document;
  var make = Ita.make;
  var each = Ita.each;

  /* Quiz: radio buttons per scored question (inside a fieldset with a real legend), a result each, a score at the end */
  function initQuestion(item, state, index) {
    var textEl = item.querySelector('.ita-q__text');
    var optionList = item.querySelector('.ita-q__options');
    var options = item.querySelectorAll('.ita-q__options > li');
    var reveal = item.querySelector('.ita-q__reveal');
    var correct = parseInt(item.getAttribute('data-correct'), 10);
    if (!textEl || !optionList || !options.length || !correct || correct > options.length) return;
    var answerEl = reveal && reveal.querySelector('.ita-q__answer');
    var whyEl = reveal && reveal.querySelector('.ita-q__why');
    var set = make('fieldset', 'ita-q__set');
    set.appendChild(make('legend', 'ita-q__text', textEl.textContent));
    var name = Ita.id('name');
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
    textEl.replaceWith(set);
    optionList.remove();
    if (reveal) reveal.remove();
    item.appendChild(result);
    set.addEventListener('change', function (event) {
      var right = parseInt(event.target.value, 10) === correct;
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
        var keys = Object.keys(state.answers);
        if (keys.length < state.total) { score.textContent = ''; return; }
        var right = keys.filter(function (k) { return state.answers[k]; }).length;
        score.textContent = 'Your score: ' + right + ' of ' + state.total + '.';
      },
    };
    each(quiz.querySelectorAll('.ita-q'), function (item, i) { initQuestion(item, state, i); });
    if (state.total) quiz.appendChild(score);
  }

  /* Glossary. Each term keeps its definition in a visually hidden element that aria-describedby points at (so screen readers
   * always have it); one shared bubble is the visible tooltip. It stays open while the pointer is on the term or the bubble
   * (WCAG 1.4.13); Escape, blur and clicks elsewhere close it. */
  function initTerms(terms) {
    var tip = make('span', 'ita-tip');
    tip.id = Ita.id('tip');
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    doc.body.appendChild(tip);
    var current = null;
    var openedAt = 0;
    var timer = 0;
    function hide() { window.clearTimeout(timer); tip.hidden = true; current = null; }
    function later() { window.clearTimeout(timer); timer = window.setTimeout(hide, 250); }
    function keep() { window.clearTimeout(timer); }
    function show(term) {
      keep();
      tip.textContent = term.getAttribute('data-define');
      tip.hidden = false;
      current = term;
      openedAt = Date.now();
      var rect = term.getBoundingClientRect();
      var left = Math.max(8, Math.min(rect.left, doc.documentElement.clientWidth - tip.offsetWidth - 8));
      tip.style.left = left + window.pageXOffset + 'px';
      tip.style.top = rect.bottom + window.pageYOffset + 2 + 'px';
    }
    tip.addEventListener('mouseenter', keep);
    tip.addEventListener('mouseleave', later);
    each(terms, function (term) {
      var define = term.getAttribute('title');
      var desc = make('span', 'ita-sr', define);
      desc.id = Ita.id('def');
      term.setAttribute('data-define', define);
      term.removeAttribute('title'); // no second, native tooltip
      term.setAttribute('aria-describedby', desc.id);
      term.parentNode.insertBefore(desc, term.nextSibling);
      term.addEventListener('mouseenter', function () { show(term); });
      term.addEventListener('mouseleave', later);
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

  Ita.ready(function () {
    each(doc.querySelectorAll('[data-ita-quiz]'), initQuiz);
    var terms = doc.querySelectorAll('abbr.ita-term[title]');
    if (terms.length) initTerms(terms);
  });
})();
