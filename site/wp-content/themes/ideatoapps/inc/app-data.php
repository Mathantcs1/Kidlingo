<?php
/**
 * Data helpers for the app detail page and cards. They return only what is safe to print publicly.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Whether an app may be shown publicly: published AND delivery status live or coming soon.
 */
function ideatoapps_app_is_visible( WP_Post $app ): bool {
	return 'app' === $app->post_type
		&& 'publish' === $app->post_status
		&& in_array( (string) get_post_meta( $app->ID, 'delivery_status', true ), array( 'live', 'coming_soon' ), true );
}

/**
 * Feature bullets, blanks dropped.
 *
 * @return string[]
 */
function ideatoapps_app_features( int $app_id ): array {
	$out = array();
	foreach ( ideatoapps_decode_list( get_post_meta( $app_id, 'features', true ) ) as $row ) {
		if ( is_string( $row ) && '' !== trim( $row ) ) {
			$out[] = trim( $row );
		}
	}
	return $out;
}

/**
 * FAQ entries; both question and answer are required.
 *
 * @return array<int, array{q: string, a: string}>
 */
function ideatoapps_app_faq( int $app_id ): array {
	$out = array();
	foreach ( ideatoapps_decode_list( get_post_meta( $app_id, 'faq', true ) ) as $row ) {
		if ( is_array( $row ) && isset( $row['q'], $row['a'] ) && '' !== trim( (string) $row['q'] ) && '' !== trim( (string) $row['a'] ) ) {
			$out[] = array( 'q' => trim( (string) $row['q'] ), 'a' => trim( (string) $row['a'] ) );
		}
	}
	return $out;
}

/**
 * Versions for the public "What's new" list, newest first: version number, release date and changelog ONLY.
 * The attachment (the downloadable file) is deliberately not part of this shape; downloads are an account feature.
 *
 * @return array<int, array{version: string, released: string, changelog: string}>
 */
function ideatoapps_public_versions( int $app_id ): array {
	$out = array();
	foreach ( ideatoapps_get_versions( $app_id ) as $row ) {
		$out[] = array(
			'version'   => $row['version'],
			'released'  => $row['released'],
			'changelog' => $row['changelog'],
		);
	}
	return $out;
}

/**
 * Launch / demo links, each only when it is a valid http(s) URL.
 *
 * @return array<string, string> Keys launch and demo (present ones only).
 */
function ideatoapps_app_action_links( int $app_id ): array {
	$out = array();
	foreach ( array( 'launch' => 'launch_url', 'demo' => 'demo_url' ) as $key => $meta ) {
		$url = trim( (string) get_post_meta( $app_id, $meta, true ) );
		if ( 1 === preg_match( '#^https?://#i', $url ) ) {
			$clean = esc_url_raw( $url, array( 'http', 'https' ) );
			if ( '' !== $clean ) {
				$out[ $key ] = $clean;
			}
		}
	}
	return $out;
}

/**
 * What the buy area shows: `buy` (label + add-to-cart href), `soon` (Coming soon, no price) or `none` (nothing to offer).
 * A buy button needs a live app, a linked product that exists, and WooCommerce active. Checkout itself is not handled here.
 *
 * @return array{kind: string, label?: string, href?: string}
 */
function ideatoapps_app_buy_state( WP_Post $app ): array {
	$status = (string) get_post_meta( $app->ID, 'delivery_status', true );
	if ( 'coming_soon' === $status ) {
		return array( 'kind' => 'soon' );
	}
	$product_id = (int) get_post_meta( $app->ID, 'woo_product_id', true );
	if ( 'live' !== $status || $product_id <= 0 || ! function_exists( 'ideatoapps_woocommerce_active' ) || ! ideatoapps_woocommerce_active() || 'product' !== get_post_type( $product_id ) || 'publish' !== get_post_status( $product_id ) ) {
		return array( 'kind' => 'none' );
	}
	$price = trim( (string) get_post_meta( $app->ID, 'price_label', true ) );
	$title = get_the_title( $app );
	return array(
		'kind'  => 'buy',
		/* translators: 1: app title, 2: price label such as "$24.99 one-time". */
		'label' => '' !== $price ? sprintf( __( 'Buy %1$s, %2$s', 'ideatoapps' ), $title, $price ) : sprintf( __( 'Buy %s', 'ideatoapps' ), $title ),
		'href'  => add_query_arg( 'add-to-cart', $product_id, get_permalink( $app ) ),
	);
}

/**
 * Other live apps to suggest (never the app itself, never coming soon or hidden ones).
 *
 * @return WP_Post[]
 */
function ideatoapps_related_apps( int $app_id, int $limit = 3 ): array {
	return get_posts(
		ideatoapps_visible_apps_args(
			array(
				'posts_per_page' => $limit,
				'post__not_in'   => array( $app_id ),
				'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- a handful of rows.
					array(
						'key'   => 'delivery_status',
						'value' => 'live',
					),
				),
			)
		)
	);
}

// A published app that is not live or coming soon is not public: its URL is a 404 for visitors (editors can still preview).
add_action(
	'template_redirect',
	static function (): void {
		if ( is_singular( 'app' ) && ! ideatoapps_app_is_visible( get_queried_object() ) && ! current_user_can( 'edit_post', get_queried_object_id() ) ) {
			global $wp_query;
			$wp_query->set_404();
			status_header( 404 );
			nocache_headers();
		}
	},
	5
);

/**
 * Structured data for an app page: an empty array unless a filter supplies it. Rating and review properties are removed
 * whatever the filter returns, because the site has no real ratings to claim.
 *
 * @param int $app_id App post ID.
 * @return array<string, mixed>
 */
function ideatoapps_app_schema( int $app_id ): array {
	$schema = apply_filters( 'ideatoapps_app_schema', array(), $app_id );
	if ( ! is_array( $schema ) ) {
		return array();
	}
	foreach ( array( 'aggregateRating', 'review', 'reviews', 'rating', 'ratingValue', 'reviewCount', 'ratingCount' ) as $key ) {
		unset( $schema[ $key ] );
	}
	return $schema;
}
