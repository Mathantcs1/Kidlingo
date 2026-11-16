/* Block editor: after the "Editorial review" box has been saved, reload the box from the server so the person sees whether the
 * sign-off worked (and that Publish must be pressed again), and say so in a snackbar. The editor itself never re-renders meta boxes. */
( function () {
	var data = window.wp && window.wp.data;
	if ( ! data ) {
		return;
	}
	var was = false;
	function refresh() {
		window.fetch( window.location.href, { credentials: 'same-origin' } )
			.then( function ( r ) { return r.text(); } )
			.then( function ( html ) {
				var doc = new DOMParser().parseFromString( html, 'text/html' );
				var fresh = doc.querySelector( '[data-testid="review-box"]' );
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
