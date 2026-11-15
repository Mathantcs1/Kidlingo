/* Mobile drawer: opened by a labelled button, closed with Escape/close button, focus trapped and returned. */
(function () {
	'use strict';
	var button = document.querySelector('[data-menu-button]');
	var drawer = document.querySelector('[data-nav-drawer]');
	if (!button || !drawer) { return; }
	var closeBtn = drawer.querySelector('[data-nav-close]');
	var background = document.querySelectorAll('[data-inert-when-menu]');
	var desktop = window.matchMedia ? matchMedia('(min-width: 768px)') : null;

	function isOpen() { return drawer.classList.contains('is-open'); }
	function focusables() { return drawer.querySelectorAll('a[href], button:not([disabled])'); }

	function open() {
		drawer.classList.add('is-open');
		button.setAttribute('aria-expanded', 'true');
		document.documentElement.classList.add('menu-open');
		for (var i = 0; i < background.length; i++) { background[i].inert = true; }
		closeBtn.focus();
	}

	function close(returnFocus) {
		drawer.classList.remove('is-open');
		button.setAttribute('aria-expanded', 'false');
		document.documentElement.classList.remove('menu-open');
		for (var i = 0; i < background.length; i++) { background[i].inert = false; }
		if (returnFocus) { button.focus(); }
	}

	button.addEventListener('click', function () { if (isOpen()) { close(true); } else { open(); } });
	closeBtn.addEventListener('click', function () { close(true); });

	document.addEventListener('keydown', function (e) {
		if (!isOpen()) { return; }
		if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
		if (e.key !== 'Tab') { return; }
		var items = focusables();
		var first = items[0];
		var last = items[items.length - 1];
		if (!drawer.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
		else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
		else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
	});

	if (desktop && desktop.addEventListener) {
		desktop.addEventListener('change', function (e) { if (e.matches && isOpen()) { close(false); } });
	}
})();
