/* IdeaToApps blog: shared helpers, prompt copy button, remembered checklists. blog-learn.js adds the quiz and glossary.
 * Everything here only enhances markup that is already readable without JavaScript. */
(function () {
  'use strict';
  var doc = document;
  var uid = 0;
  var tasks = [];
  var started = false;

  var Ita = window.ItaBlog = {
    make: function (tag, cls, text) {
      var node = doc.createElement(tag);
      if (cls) node.className = cls;
      if (text) node.textContent = text;
      return node;
    },
    id: function (prefix) { uid += 1; return 'ita-js-' + prefix + '-' + uid; },
    each: function (list, fn) { Array.prototype.forEach.call(list, fn); },
    /* Storage can throw (private mode, blocked cookies): every access is wrapped. */
    load: function (key) {
      try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch (e) { return null; }
    },
    save: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* not remembered */ }
    },
    /* Run an enhancer once the page is parsed. */
    ready: function (fn) {
      if (started) fn(); else tasks.push(fn);
    },
  };
  var make = Ita.make;
  var each = Ita.each;

  /* Prompt: copy button */
  function legacyCopy(text) {
    var previous = doc.activeElement;
    var area = make('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    doc.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length); // iOS ignores select() alone
    var ok = false;
    try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
    doc.body.removeChild(area);
    if (previous && previous.focus) previous.focus(); // the reader's place on the page is kept
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
        // Empty first, then set: a repeated "Copied" is announced again by screen readers.
        status.textContent = '';
        window.setTimeout(function () { status.textContent = ok ? 'Copied' : 'Copy failed. Select the text and copy it.'; }, 60);
        window.clearTimeout(timer);
        timer = window.setTimeout(function () { status.textContent = ''; }, 3500);
      });
    });
    bar.appendChild(button);
    bar.appendChild(status);
    box.appendChild(bar);
  }

  /* Checklist: checkboxes remembered per checklist id and page; ticks are dropped when the items changed (hash differs) */
  function initChecklist(box) {
    var key = 'ita-checklist:' + window.location.pathname + ':' + box.getAttribute('data-ita-checklist');
    var hash = box.getAttribute('data-ita-hash') || '';
    var saved = Ita.load(key);
    var checked = saved && !Array.isArray(saved) && saved.h === hash && Array.isArray(saved.c) ? saved.c : [];
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
        Ita.save(key, { h: hash, c: now });
        refresh();
      });
    });
    box.appendChild(status);
    refresh();
  }

  function init() {
    if (started) return;
    started = true;
    each(doc.querySelectorAll('[data-ita-prompt]'), initPrompt);
    each(doc.querySelectorAll('[data-ita-checklist]'), initChecklist);
    tasks.forEach(function (fn) { fn(); });
  }
  /* Deferred scripts run in order before DOMContentLoaded, so blog-learn.js has registered its task by then; the load
   * listener covers a script that arrives after DOMContentLoaded, and ready() runs late tasks at once. */
  if (doc.readyState === 'complete') init(); else { doc.addEventListener('DOMContentLoaded', init); window.addEventListener('load', init); }
})();
