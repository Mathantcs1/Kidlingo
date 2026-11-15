<?php
/**
 * Data helpers for the home page. Every helper answers "is there anything to show?" so a part can return early.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const IDEATOAPPS_HOME_APP_LIMIT = 6;

/**
 * Query args for apps that may be shown publicly: published AND delivery status live or coming soon.
 *
 * @param array<string, mixed> $extra Overrides.
 * @return array<string, mixed>
 */
function ideatoapps_visible_apps_args( array $extra = array() ): array {
	return array_merge(
		array(
			'post_type'           => 'app',
			'post_status'         => 'publish',
			'posts_per_page'      => IDEATOAPPS_HOME_APP_LIMIT,
			'ignore_sticky_posts' => true,
			'no_found_rows'       => true,
			'orderby'             => array( 'date' => 'DESC', 'ID' => 'DESC' ),
			'meta_query'          => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- a handful of rows.
				array(
					'key'     => 'delivery_status',
					'value'   => array( 'live', 'coming_soon' ),
					'compare' => 'IN',
				),
			),
		),
		$extra
	);
}

/**
 * Apps for the home page grid: the chosen ones (in the chosen order) if any of them is still visible, otherwise the latest.
 *
 * @return WP_Post[]
 */
function ideatoapps_featured_apps(): array {
	if ( ! post_type_exists( 'app' ) ) {
		return array();
	}
	$ids = array_values( array_filter( array_map( 'absint', (array) get_option( 'ideatoapps_featured_app_ids', array() ) ) ) );
	if ( $ids ) {
		$chosen = get_posts( ideatoapps_visible_apps_args( array( 'post__in' => $ids, 'orderby' => 'post__in' ) ) );
		if ( $chosen ) {
			return $chosen;
		}
	}
	return get_posts( ideatoapps_visible_apps_args() );
}

/**
 * Categories that contain at least one visible app, with that count, sorted by name.
 *
 * @return array<int, array{term: WP_Term, count: int}>
 */
function ideatoapps_home_categories(): array {
	if ( ! taxonomy_exists( 'app_category' ) ) {
		return array();
	}
	$app_ids = get_posts( ideatoapps_visible_apps_args( array( 'posts_per_page' => -1, 'fields' => 'ids' ) ) );
	if ( ! $app_ids ) {
		return array();
	}
	$counts = array();
	$terms  = array();
	$rows   = wp_get_object_terms( $app_ids, 'app_category', array( 'fields' => 'all_with_object_id' ) );
	foreach ( is_wp_error( $rows ) ? array() : $rows as $term ) {
		$counts[ $term->term_id ] = ( $counts[ $term->term_id ] ?? 0 ) + 1;
		$terms[ $term->term_id ]  = $term;
	}
	$out = array();
	foreach ( $terms as $id => $term ) {
		$out[] = array( 'term' => $term, 'count' => $counts[ $id ] );
	}
	usort( $out, static fn( array $a, array $b ): int => strcasecmp( $a['term']->name, $b['term']->name ) );
	return $out;
}

/**
 * Latest published videos.
 *
 * @param int $limit How many.
 * @return WP_Post[]
 */
function ideatoapps_home_videos( int $limit = 3 ): array {
	if ( ! post_type_exists( 'video' ) ) {
		return array();
	}
	return get_posts( array( 'post_type' => 'video', 'post_status' => 'publish', 'posts_per_page' => $limit, 'orderby' => array( 'date' => 'DESC', 'ID' => 'DESC' ), 'no_found_rows' => true ) );
}

/**
 * Whether at least one video is published.
 */
function ideatoapps_has_published_video(): bool {
	return (bool) ideatoapps_home_videos( 1 );
}

/**
 * The channel link, only when it is a valid http(s) URL.
 */
function ideatoapps_youtube_channel_url(): string {
	$url = trim( (string) get_option( 'ideatoapps_youtube_channel_url', '' ) );
	return 1 === preg_match( '#^https?://#i', $url ) ? esc_url_raw( $url, array( 'http', 'https' ) ) : '';
}

/**
 * Whether the newsletter REST endpoint (owned by a later task) exists.
 */
function ideatoapps_newsletter_available(): bool {
	$routes = rest_get_server()->get_routes( 'ideatoapps/v1' );
	return isset( $routes['/ideatoapps/v1/newsletter'] );
}
