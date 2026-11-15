/*
 * Newsletter and contact forms. Each form carries its REST URL (action) and a nonce (data-nonce); the JSON goes to the
 * endpoint with X-WP-Nonce and the answer is written to the form's status line (role="status").
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

	document.querySelectorAll('form[data-ideatoapps-form]').forEach(function (form) {
		form.addEventListener('submit', function (event) {
			event.preventDefault();
			var submit = form.querySelector('[type="submit"]');
			if (submit) { submit.disabled = true; }
			say(form, 'Sending...', 'busy');
			fetch(form.getAttribute('action'), {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': form.getAttribute('data-nonce') || '' },
				body: JSON.stringify(data(form))
			}).then(function (res) {
				return res.json().catch(function () { return {}; }).then(function (json) { return { ok: res.ok, json: json }; });
			}).then(function (r) {
				if (r.ok) {
					form.reset();
					say(form, (r.json && r.json.message) || 'Done.', 'ok');
				} else {
					say(form, (r.json && r.json.message) || 'Something went wrong. Please try again.', 'error');
				}
			}).catch(function () {
				say(form, 'Could not reach the site. Check your connection and try again.', 'error');
			}).then(function () {
				if (submit) { submit.disabled = false; }
			});
		});
	});
}());
