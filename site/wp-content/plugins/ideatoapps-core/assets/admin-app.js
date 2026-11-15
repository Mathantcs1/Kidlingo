/* Admin helpers for the app edit screen: FAQ rows and the media-library file picker. */
( function ( $ ) {
	'use strict';

	var rows = document.getElementById( 'ita-faq-rows' );
	var tpl = document.getElementById( 'ita-faq-template' );
	var add = document.getElementById( 'ita-faq-add' );
	if ( rows && tpl && add ) {
		add.addEventListener( 'click', function () {
			rows.appendChild( tpl.content.cloneNode( true ) );
		} );
		rows.addEventListener( 'click', function ( e ) {
			if ( e.target.classList.contains( 'ita-faq-remove' ) ) {
				e.target.closest( '.ita-faq-row' ).remove();
			}
		} );
	}

	$( document ).on( 'click', '.ita-pick', function ( e ) {
		e.preventDefault();
		var box = $( this ).closest( '.ita-file' );
		var frame = wp.media( { title: $( this ).data( 'title' ), multiple: false } );
		frame.on( 'select', function () {
			var file = frame.state().get( 'selection' ).first().toJSON();
			box.find( 'input[type=hidden]' ).val( file.id );
			box.find( '.ita-file-name' ).text( file.filename || file.title );
		} );
		frame.open();
	} );
}( jQuery ) );
