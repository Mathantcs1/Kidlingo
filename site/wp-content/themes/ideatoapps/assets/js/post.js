/* Single blog post: reading-progress bar, contents that collapse on phones, and the current heading marked in the contents.
 * Everything here only enhances markup that already works without JavaScript (plain anchor links, an open contents list). */
(function () {
  'use strict';
  var doc = document;
  var body = doc.querySelector('.post-body');
  if (!body) return;

  var bar = doc.querySelector('[data-testid="post-progress"] .post-progress__bar');
  var details = doc.querySelector('.post-toc__details');
  var links = Array.prototype.slice.call(doc.querySelectorAll('.post-toc__list a'));
  var offset = 110; /* a heading counts as "current" once it is under the sticky header */
  var queued = false;

  /* The heading a contents link points to. Ids are plain ASCII, but an author-set id may hold odd characters: try the raw
   * text first, then the decoded one, and never throw. */
  function target(link) {
    var raw = (link.getAttribute('href') || '').slice(1);
    if (!raw) return null;
    var found = doc.getElementById(raw);
    if (found) return found;
    try { return doc.getElementById(decodeURIComponent(raw)); } catch (e) { return null; }
  }

  function clamp(n) { return Math.max(0, Math.min(1, n)); }

  function update() {
    queued = false;
    var rect = body.getBoundingClientRect();
    if (bar) {
      var total = rect.height - window.innerHeight;
      bar.style.transform = 'scaleX(' + clamp(total > 0 ? -rect.top / total : (rect.bottom <= window.innerHeight ? 1 : 0)).toFixed(4) + ')';
    }
    var current = null;
    links.forEach(function (link) {
      var heading = target(link);
      if (heading && heading.getBoundingClientRect().top <= offset) current = link;
    });
    links.forEach(function (link) {
      if (link === current) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    });
  }

  function queue() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(update);
  }

  if (details && window.matchMedia) {
    /* Phones: collapsed to save room. Desktop: always open (the list is a sticky sidebar there). */
    var wide = window.matchMedia('(min-width: 1024px)');
    var sync = function () { details.open = wide.matches; };
    sync();
    if (wide.addEventListener) wide.addEventListener('change', sync); else if (wide.addListener) wide.addListener(sync);
  }

  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  update();
})();
