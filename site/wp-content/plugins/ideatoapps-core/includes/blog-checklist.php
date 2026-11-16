<?php
/**
 * [ita_checklist id=""] with nested [ita_item]text[/ita_item]. Static markup is a plain list; blog.js adds checkboxes and
 * remembers them in localStorage under the checklist id.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Items inside a checklist body.
 *
 * @param string $content Body.
 * @return string[]
 */
function ideatoapps_blog_checklist_items( string $content ): array {
	$items = array();
	if ( preg_match_all( '/' . get_shortcode_regex( array( 'ita_item' ) ) . '/', $content, $found, PREG_SET_ORDER ) ) {
		foreach ( $found as $match ) {
			$text = ideatoapps_blog_clean( $match[5], 300 );
			if ( '' !== $text ) {
				$items[] = $text;
			}
		}
	}
	return $items;
}

/**
 * [ita_checklist]: without items the body is shown as plain text (or nothing).
 *
 * @param mixed  $atts    Attributes.
 * @param string $content Body.
 * @return string
 */
function ideatoapps_blog_checklist( $atts, $content = '' ): string {
	$atts    = ideatoapps_blog_atts( $atts, array( 'id' => '' ), 'ita_checklist' );
	$content = is_string( $content ) ? $content : '';
	$items   = ideatoapps_blog_checklist_items( $content );
	if ( ! $items ) {
		$loose = ideatoapps_blog_clean( preg_replace( '/' . get_shortcode_regex( array( 'ita_item' ) ) . '/', '', $content ), 600 );
		return '' === $loose ? '' : '<p class="ita-checklist__loose">' . esc_html( $loose ) . '</p>';
	}
	$id = substr( sanitize_key( ideatoapps_blog_clean( $atts['id'], 60 ) ), 0, 40 );
	if ( '' === $id ) {
		$id = 'list-' . substr( md5( implode( "\n", $items ) ), 0, 8 ); // stable while the items stay the same.
	}
	$html = '<div class="ita-checklist" data-testid="ita-checklist" data-ita-checklist="' . esc_attr( $id ) . '"><ul class="ita-checklist__list">';
	foreach ( $items as $item ) {
		$html .= '<li class="ita-checklist__item">' . esc_html( $item ) . '</li>';
	}
	return $html . '</ul></div>';
}

/** [ita_item] used outside a checklist: its text, nothing else. */
function ideatoapps_blog_item_alone( $atts, $content = '' ): string {
	return esc_html( ideatoapps_blog_clean( $content, 300 ) );
}

add_shortcode( 'ita_checklist', 'ideatoapps_blog_checklist' );
add_shortcode( 'ita_item', 'ideatoapps_blog_item_alone' );
