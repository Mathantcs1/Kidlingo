<?php
/**
 * The content pages the theme has templates for. They are created once (empty shells: the theme prints the draft
 * text), never re-created if the owner trashes or deletes one, and never overwritten.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Slug => title of every page the site links to.
 *
 * @return array<string, string>
 */
function ideatoapps_content_pages() {
	return array(
		'about'         => __( 'About', 'ideatoapps-core' ),
		'contact'       => __( 'Contact', 'ideatoapps-core' ),
		'faq'           => __( 'FAQ', 'ideatoapps-core' ),
		'blog'          => __( 'Blog', 'ideatoapps-core' ),
		'privacy'       => __( 'Privacy policy', 'ideatoapps-core' ),
		'terms'         => __( 'Terms of service', 'ideatoapps-core' ),
		'refund-policy' => __( 'Refund policy', 'ideatoapps-core' ),
	);
}

/**
 * Create the missing pages. Slugs handled before (even if the page is gone now) are remembered and skipped.
 */
function ideatoapps_ensure_pages() {
	$done    = array_map( 'strval', (array) get_option( 'ideatoapps_seeded_pages', array() ) );
	$changed = false;
	foreach ( ideatoapps_content_pages() as $slug => $title ) {
		if ( in_array( $slug, $done, true ) ) {
			continue;
		}
		if ( null === get_page_by_path( $slug ) ) {
			wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_name' => $slug, 'post_title' => $title, 'post_content' => '' ) );
		}
		$done[]  = $slug;
		$changed = true;
	}
	if ( $changed ) {
		update_option( 'ideatoapps_seeded_pages', $done, false );
	}
}
