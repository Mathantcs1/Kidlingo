/*
 * Catalog enhancement. The page already works with plain GET (a form to /apps/?s=&category=&sort=); this only avoids full
 * reloads: it debounces search, swaps the results region in place, keeps the URL in sync with pushState and handles Back.
 * Any failure falls back to a normal navigation.
 */
(function () {
	'use strict';
	var form = document.querySelector('[data-catalog-form]');
	var region = document.querySelector('[data-catalog-region]');
	if (!form || !region || !window.fetch || !window.URL || !window.history || !history.pushState) { return; }

	var search = form.elements.s;
	var controller = null;
	var timer = null;

	function urlFromForm() {
		var url = new URL(form.getAttribute('action'), window.location.href);
		var s = search.value.trim();
		var category = form.elements.category ? form.elements.category.value : '';
		var sort = form.elements.sort.value;
		if (s) { url.searchParams.set('s', s); }
		if (category) { url.searchParams.set('category', category); }
		if (sort === 'title') { url.searchParams.set('sort', 'title'); }
		return url.toString();
	}

	function syncForm(url) {
		var params = new URL(url, window.location.href).searchParams;
		search.value = params.get('s') || '';
		if (form.elements.category) { form.elements.category.value = params.get('category') || ''; }
		form.elements.sort.value = params.get('sort') === 'title' ? 'title' : 'newest';
	}

	function load(url, push) {
		if (controller) { controller.abort(); }
		controller = window.AbortController ? new AbortController() : null;
		fetch(url, { credentials: 'same-origin', signal: controller ? controller.signal : undefined })
			.then(function (res) { if (!res.ok) { throw new Error('status ' + res.status); } return res.text(); })
			.then(function (html) {
				var doc = new DOMParser().parseFromString(html, 'text/html');
				var next = doc.querySelector('[data-catalog-region]');
				if (!next) { throw new Error('no region'); }
				region.innerHTML = next.innerHTML;
				if (doc.title) { document.title = doc.title; }
				if (push && url !== window.location.href) { history.pushState({ catalog: true }, '', url); }
			})
			.catch(function (err) {
				if (err && err.name === 'AbortError') { return; }
				window.location.href = url;
			});
	}

	function update() {
		window.clearTimeout(timer);
		load(urlFromForm(), true);
	}

	search.addEventListener('input', function () {
		window.clearTimeout(timer);
		timer = window.setTimeout(update, 350);
	});
	form.addEventListener('change', function (event) { if (event.target !== search) { update(); } });
	form.addEventListener('submit', function (event) { event.preventDefault(); update(); });
	window.addEventListener('popstate', function () {
		window.clearTimeout(timer);
		syncForm(window.location.href);
		load(window.location.href, false);
	});
})();
