<?php
/**
 * Tables in blog posts: post.css lets a wide table scroll inside itself (display: block; overflow-x: auto). A scrolling region
 * must be reachable with the keyboard, so every table in a post's content gets tabindex="0" (an existing tabindex is kept).
 * Its accessible name is the table's <caption>, which the content lint requires.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Add tabindex="0" to every <table> that has no tabindex. Markup without a table is returned unchanged.
 */
function ideatoapps_post_tables_focusable( string $html ): string {
	if ( false === stripos( $html, '<table' ) || ! class_exists( 'WP_HTML_Tag_Processor' ) ) {
		return $html;
	}
	$tags = new WP_HTML_Tag_Processor( $html );
	while ( $tags->next_tag( 'table' ) ) {
		if ( null === $tags->get_attribute( 'tabindex' ) ) {
			$tags->set_attribute( 'tabindex', '0' );
		}
	}
	return $tags->get_updated_html();
}

add_filter(
	'the_content',
	static fn( $html ) => is_string( $html ) && 'post' === get_post_type() ? ideatoapps_post_tables_focusable( $html ) : $html,
	20
);
