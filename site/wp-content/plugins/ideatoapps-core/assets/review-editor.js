/* Block editor: after the "Editorial review" box has been saved, reload the box from the server so the person sees whether the
 * sign-off worked (and that Publish must be pressed again), and say so in a snackbar. A refused publish ("Not published: needs human
 * review") is shown as an editor notice. The editor itself never re-renders meta boxes. */
( function () {
	var data = window.wp && window.wp.data;
	if ( ! data ) {
		return;
	}
	var was = false;
	function refresh() {
		var url = window.location.href + ( window.location.href.indexOf( '?' ) < 0 ? '?' : '&' ) + 'ita_box=1'; // marks the fetch for the refusal notice.
		window.fetch( url, { credentials: 'same-origin' } )
			.then( function ( r ) { return r.text(); } )
			.then( function ( html ) {
				var doc = new DOMParser().parseFromString( html, 'text/html' );
				var notices = data.dispatch( 'core/notices' );
				var fresh = doc.querySelector( '[data-testid="review-box"]' );
				// A refused publish leaves a one-time admin notice that the editor never shows; repeat it, unless the same save signed
				// the post off (then the box itself says to press Publish again).
				var refused = doc.querySelector( '[data-testid="review-refused"]' );
				var signed = fresh && fresh.querySelector( '[data-testid="review-box-result"]' );
				if ( refused && notices && ! ( signed && /Publish again/i.test( signed.textContent ) ) ) {
					notices.createNotice( 'error', refused.textContent.trim(), { id: 'ita-review-refused', isDismissible: true } );
				}
				var current = document.querySelector( '[data-testid="review-box"]' );
				if ( ! fresh || ! current ) {
					return;
				}
				current.replaceWith( document.importNode( fresh, true ) );
				var res = fresh.querySelector( '[data-testid="review-box-result"]' );
				if ( res && data.dispatch( 'core/notices' ) ) {
					data.dispatch( 'core/notices' ).createNotice( /^Not signed off/.test( res.textContent ) ? 'error' : 'info', res.textContent, { type: 'snackbar' } );
				}
			} )
			.catch( function () {} );
	}
	data.subscribe( function () {
		var editPost = data.select( 'core/edit-post' );
		if ( ! editPost || ! editPost.isSavingMetaBoxes ) {
			return;
		}
		var now = editPost.isSavingMetaBoxes();
		if ( was && ! now ) {
			refresh();
		}
		was = now;
	} );
}() );
