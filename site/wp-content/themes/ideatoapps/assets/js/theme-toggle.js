/* Theme toggle: flips html[data-theme], remembers the choice (localStorage, try/catch), follows the OS until a choice is made. */
(function () {
	'use strict';
	var KEY = 'ideatoapps-theme';
	var root = document.documentElement;
	var buttons = document.querySelectorAll('[data-theme-toggle]');
	if (!buttons.length) { return; }

	function current() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
	function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
	function label() {
		var next = current() === 'light' ? 'dark' : 'light';
		for (var i = 0; i < buttons.length; i++) { buttons[i].setAttribute('aria-label', 'Switch to ' + next + ' theme'); }
	}
	function apply(theme) { root.setAttribute('data-theme', theme); label(); }

	for (var i = 0; i < buttons.length; i++) {
		buttons[i].addEventListener('click', function () {
			var next = current() === 'light' ? 'dark' : 'light';
			apply(next);
			try { localStorage.setItem(KEY, next); } catch (e) { /* storage blocked: the choice lasts for this page only */ }
		});
	}

	if (window.matchMedia) {
		var mq = matchMedia('(prefers-color-scheme: light)');
		var onChange = function (e) { if (!stored()) { apply(e.matches ? 'light' : 'dark'); } };
		if (mq.addEventListener) { mq.addEventListener('change', onChange); }
	}
	label();
})();
