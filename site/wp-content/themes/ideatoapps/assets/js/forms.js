/*
 * Newsletter and contact forms. Each form carries its REST URL (action) and a nonce (data-nonce); the JSON goes to the
 * endpoint with X-WP-Nonce and the answer is written to the form's status line (role="status"). A stale (cached) nonce is
 * refreshed once from data-nonce-url and the request retried once.
 */
(function () {
	'use strict';
	if (!window.fetch) { return; }

	function say(form, text, state) {
		var out = form.querySelector('[data-form-status]');
		if (!out) { return; }
		out.textContent = text;
		out.setAttribute('data-state', state);
	}

	function data(form) {
		var body = {};
		Array.prototype.forEach.call(form.elements, function (el) {
			if (!el.name) { return; }
			body[el.name] = el.type === 'checkbox' ? el.checked : el.value;
		});
		return body;
	}

	// A page served from a cache can carry a nonce that has expired. Only these two answers mean "stale nonce".
	var STALE = ['ideatoapps_bad_nonce', 'rest_cookie_invalid_nonce'];
	var FAILED = 'Something went wrong. Please reload the page and try again.';

	function send(form, body, nonce) {
		return fetch(form.getAttribute('action'), {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
			body: JSON.stringify(body)
		}).then(function (res) {
			return res.json().catch(function () { return {}; }).then(function (json) { return { ok: res.ok, status: res.status, json: json || {} }; });
		});
	}

	function isStale(r) {
		return !r.ok && r.status === 403 && STALE.indexOf(r.json.code) !== -1;
	}

	// One fresh nonce, at most one retry. Resolves to a result; a stale answer after the retry stays stale.
	function submit(form, body) {
		return send(form, body, form.getAttribute('data-nonce') || '').then(function (first) {
			var url = form.getAttribute('data-nonce-url');
			if (!isStale(first) || !url) { return first; }
			return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (res) {
				return res.ok ? res.json() : {};
			}).then(function (fresh) {
				if (!fresh || typeof fresh.nonce !== 'string' || !fresh.nonce) { return first; }
				form.setAttribute('data-nonce', fresh.nonce);
				return send(form, body, fresh.nonce); // the one and only retry.
			});
		});
	}

	document.querySelectorAll('form[data-ideatoapps-form]').forEach(function (form) {
		form.addEventListener('submit', function (event) {
			event.preventDefault();
			var submitButton = form.querySelector('[type="submit"]');
			if (submitButton) { submitButton.disabled = true; }
			say(form, 'Sending...', 'busy');
			submit(form, data(form)).then(function (r) {
				if (r.ok) {
					form.reset();
					say(form, (r.json && r.json.message) || 'Done.', 'ok');
				} else if (isStale(r)) {
					say(form, FAILED, 'error'); // fixed text: never the server's wording for a nonce failure.
				} else {
					say(form, (r.json && r.json.message) || 'Something went wrong. Please try again.', 'error');
				}
			}).catch(function () {
				say(form, 'Could not reach the site. Check your connection and try again.', 'error');
			}).then(function () {
				if (submitButton) { submitButton.disabled = false; }
			});
		});
	});
}());
