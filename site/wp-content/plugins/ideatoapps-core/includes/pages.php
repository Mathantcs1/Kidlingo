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
 * Whether the owner already has a page for this slug in the trash (WordPress renames it to `<slug>__trashed`).
 *
 * @param string $slug Page slug.
 * @return bool
 */
function ideatoapps_page_is_trashed( $slug ) {
	$found = get_posts(
		array(
			'post_type'      => 'page',
			'post_status'    => 'trash',
			'name'           => $slug . '__trashed',
			'posts_per_page' => 1,
			'fields'         => 'ids',
			'no_found_rows'  => true,
		)
	);
	return ! empty( $found );
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
		if ( null === get_page_by_path( $slug ) && ! ideatoapps_page_is_trashed( $slug ) ) {
			$id = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_name' => $slug, 'post_title' => $title, 'post_content' => '' ), true );
			if ( is_wp_error( $id ) || 0 === $id ) {
				continue; // Not created: do not remember it, the next request tries again.
			}
		}
		$done[]  = $slug;
		$changed = true;
	}
	if ( $changed ) {
		update_option( 'ideatoapps_seeded_pages', $done, false );
	}
}
