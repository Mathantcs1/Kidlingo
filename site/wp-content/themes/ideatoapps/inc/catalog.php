<?php
/**
 * Catalog (/apps/): request parsing, query args and routing. Filters are plain GET (?s=&category=&sort=), so the page works
 * without JavaScript; assets/js/catalog.js only enhances it.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const IDEATOAPPS_CATALOG_PER_PAGE = 12;

/**
 * The filters in the current request, sanitised. Arrays and unknown sort values fall back to the defaults.
 *
 * @return array{search: string, category: string, sort: string}
 */
function ideatoapps_catalog_request(): array {
	// phpcs:disable WordPress.Security.NonceVerification.Recommended -- read-only filters in a public GET.
	$raw  = static fn( string $key ): string => isset( $_GET[ $key ] ) && is_string( $_GET[ $key ] ) ? wp_unslash( $_GET[ $key ] ) : '';
	$sort = $raw( 'sort' );
	// phpcs:enable
	return array(
		'search'   => trim( sanitize_text_field( $raw( 's' ) ) ),
		'category' => sanitize_title( $raw( 'category' ) ),
		'sort'     => 'title' === $sort ? 'title' : 'newest',
	);
}

/**
 * WP_Query args for the catalog: only visible apps (published AND live or coming soon), stable order with an ID tiebreak.
 *
 * @param array{search: string, category: string, sort: string} $req   Filters.
 * @param int                                                   $paged Page number.
 * @return array<string, mixed>
 */
function ideatoapps_catalog_query_args( array $req, int $paged = 1 ): array {
	$args = ideatoapps_visible_apps_args(
		array(
			'posts_per_page' => IDEATOAPPS_CATALOG_PER_PAGE,
			'paged'          => max( 1, $paged ),
			'no_found_rows'  => false,
			'orderby'        => 'title' === $req['sort'] ? array( 'title' => 'ASC', 'ID' => 'ASC' ) : array( 'date' => 'DESC', 'ID' => 'DESC' ),
		)
	);
	if ( '' !== $req['search'] ) {
		$args['s'] = $req['search'];
	}
	if ( '' !== $req['category'] ) {
		$args['tax_query'] = array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query -- one slug, indexed join.
			array(
				'taxonomy' => 'app_category',
				'field'    => 'slug',
				'terms'    => array( $req['category'] ),
			),
		);
	}
	return $args;
}

/**
 * The catalog URL for some filters; defaults are left out so the clean URL stays /apps/.
 *
 * @param array<string, string> $req Filters (search, category, sort).
 */
function ideatoapps_catalog_url( array $req ): string {
	$query = array();
	if ( ! empty( $req['search'] ) ) {
		$query['s'] = $req['search'];
	}
	if ( ! empty( $req['category'] ) ) {
		$query['category'] = $req['category'];
	}
	if ( 'title' === ( $req['sort'] ?? '' ) ) {
		$query['sort'] = 'title';
	}
	return add_query_arg( array_map( 'rawurlencode', $query ), (string) get_post_type_archive_link( 'app' ) );
}

/**
 * Whether the main query is the catalog: the apps archive, or a search that is scoped to apps (/apps/?s=).
 */
function ideatoapps_is_catalog( ?WP_Query $query = null ): bool {
	$query = $query ?? $GLOBALS['wp_query'];
	return $query->is_post_type_archive( 'app' ) || ( $query->is_search() && 'app' === $query->get( 'post_type' ) );
}

// The main query of the catalog uses the same args as everything else (one query, no N+1: term/meta caches are primed).
add_action(
	'pre_get_posts',
	static function ( WP_Query $query ): void {
		if ( is_admin() || ! $query->is_main_query() || ! ideatoapps_is_catalog( $query ) ) {
			return;
		}
		$args = ideatoapps_catalog_query_args( ideatoapps_catalog_request(), max( 1, (int) $query->get( 'paged' ) ) );
		unset( $args['s'], $args['paged'], $args['post_type'], $args['no_found_rows'] );
		foreach ( $args as $key => $value ) {
			$query->set( $key, $value );
		}
		$query->set( 's', ideatoapps_catalog_request()['search'] );
	}
);

// A search is routed to the search template by default; /apps/?s= must stay on the catalog template.
add_filter(
	'template_include',
	static function ( string $template ): string {
		if ( ideatoapps_is_catalog() ) {
			$catalog = locate_template( 'archive-app.php' );
			return '' !== $catalog ? $catalog : $template;
		}
		return $template;
	}
);

// The category archive URL (/apps/category/x/) is the catalog filtered by that category. This runs on parse_request: a
// category-only archive query would otherwise look for posts, find none, and answer 404.
add_action(
	'parse_request',
	static function ( WP $wp ): void {
		if ( is_admin() || empty( $wp->query_vars['app_category'] ) || ! is_string( $wp->query_vars['app_category'] ) || ! empty( $wp->query_vars['feed'] ) || ! empty( $wp->query_vars['rest_route'] ) ) {
			return;
		}
		wp_safe_redirect( ideatoapps_catalog_url( array( 'category' => sanitize_title( $wp->query_vars['app_category'] ) ) ), 301 );
		exit;
	}
);
