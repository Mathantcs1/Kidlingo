/*
 * Click-to-play YouTube. The page ships only a button per video; nothing is requested from YouTube until the
 * visitor presses it. The player is then the privacy-enhanced youtube-nocookie.com embed. Without JavaScript the
 * button does nothing (the video is on the YouTube channel).
 */
(function () {
	'use strict';
	var ID = /^[A-Za-z0-9_-]{11}$/;

	document.addEventListener('click', function (event) {
		var button = event.target.closest && event.target.closest('.video-play[data-youtube-id]');
		if (!button) { return; }
		var id = button.getAttribute('data-youtube-id');
		var frame = button.closest('[data-video-frame]');
		if (!frame || !ID.test(id)) { return; }

		var iframe = document.createElement('iframe');
		iframe.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
		iframe.title = button.getAttribute('data-video-title') || 'Video';
		iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
		iframe.referrerPolicy = 'strict-origin-when-cross-origin';
		iframe.setAttribute('allowfullscreen', '');
		iframe.setAttribute('data-testid', 'youtube-player');

		var poster = frame.querySelector('.video-frame__poster');
		if (poster) { poster.remove(); }
		button.replaceWith(iframe);
		iframe.focus();
	});
}());
