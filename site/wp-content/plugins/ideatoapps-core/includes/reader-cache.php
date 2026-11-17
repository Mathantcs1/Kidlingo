<?php
/**
 * Page caches and the reader gate. Pages cached while a post was open (switch off, box unticked) would keep serving the whole body
 * after it is gated, so switching the newsletter on or off, and changing a post's "Subscribers only" box, purges the common page
 * caches when they are installed (LiteSpeed Cache, WP Rocket, W3 Total Cache, WP Super Cache) and the object cache of that post.
 * Nothing happens (and nothing fails) when no cache plugin is active. Host or CDN caches outside WordPress must be purged by hand
 * (DEPLOYMENT_BLUEHOST.md).
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Purge page caches: one post (and then everything, since cards, feeds and the blog index show it) or the whole site.
 *
 * @param int $post_id Post whose gate changed, or 0.
 */
function ideatoapps_reader_purge_caches( int $post_id = 0 ): void {
	if ( $post_id > 0 ) {
		clean_post_cache( $post_id );
		do_action( 'litespeed_purge_post', $post_id );
	}
	do_action( 'litespeed_purge_all' );
	if ( function_exists( 'rocket_clean_domain' ) ) {
		rocket_clean_domain();
	}
	if ( function_exists( 'w3tc_flush_all' ) ) {
		w3tc_flush_all();
	}
	if ( function_exists( 'wp_cache_clear_cache' ) ) {
		wp_cache_clear_cache();
	}
	do_action( 'ideatoapps_reader_caches_purged', $post_id );
}

add_action( 'update_option_ideatoapps_newsletter_enabled', static fn() => ideatoapps_reader_purge_caches() );
add_action( 'add_option_ideatoapps_newsletter_enabled', static fn() => ideatoapps_reader_purge_caches() );

/**
 * Whether any published post is subscriber-only right now (switch on and at least one ticked box).
 */
function ideatoapps_reader_any_gated(): bool {
	if ( ! ideatoapps_newsletter_enabled() ) {
		return false;
	}
	$ids = get_posts(
		array(
			'post_type'      => 'post',
			'post_status'    => 'publish',
			'posts_per_page' => 1,
			'fields'         => 'ids',
			'no_found_rows'  => true,
			'meta_key'       => 'ita_gated', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- one small lookup on the confirm page.
			'meta_value'     => '1', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		)
	);
	return (bool) $ids;
}
