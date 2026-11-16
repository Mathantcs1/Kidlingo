<?php
/**
 * Which pages search engines must not index, and the single robots meta tag that says so.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Whether the plugin prints the SEO head output. False when a known SEO plugin is active (it owns canonical, description,
 * Open Graph, robots.txt and the sitemap then) or when `ideatoapps_seo_enabled` says so.
 */
function ideatoapps_seo_enabled(): bool {
	$other = defined( 'WPSEO_VERSION' ) || defined( 'RANK_MATH_VERSION' ) || defined( 'AIOSEO_VERSION' ) || defined( 'SEOPRESS_VERSION' ) || defined( 'THE_SEO_FRAMEWORK_VERSION' );
	return (bool) apply_filters( 'ideatoapps_seo_enabled', ! $other );
}

/**
 * Whether the optional content module behind the current archive or page has anything to show (empty modules are noindex).
 */
function ideatoapps_seo_module_is_empty(): bool {
	global $wp_query;
	if ( is_post_type_archive( array( 'app', 'video' ) ) ) {
		return 0 === (int) $wp_query->found_posts;
	}
	if ( is_page( 'blog' ) ) {
		return 0 === (int) wp_count_posts( 'post' )->publish;
	}
	if ( is_page( 'contact' ) ) {
		return ! ideatoapps_contact_enabled();
	}
	return false;
}

/**
 * The blog filters of the current request (`q` search text, `cat` category slug, `pg` page), parsed by the theme so the head says
 * exactly what the page renders. Without the theme (or off the blog page) nothing is filtered.
 *
 * @return array{cat:string, q:string, pg:int}
 */
function ideatoapps_seo_blog_filters(): array {
	$none = array( 'cat' => '', 'q' => '', 'pg' => 1 );
	if ( ! is_page( 'blog' ) || ! function_exists( 'ideatoapps_blog_request' ) ) {
		return $none;
	}
	return ideatoapps_blog_request( wp_unslash( $_GET ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only filters.
}

/**
 * The page number of the current request: the blog uses the theme's parser (junk means page 1), other pages `?pg=` as a number.
 */
function ideatoapps_seo_page_number(): int {
	if ( is_page( 'blog' ) && function_exists( 'ideatoapps_blog_request' ) ) {
		return ideatoapps_seo_blog_filters()['pg'];
	}
	$pg = isset( $_GET['pg'] ) && is_string( $_GET['pg'] ) ? absint( wp_unslash( $_GET['pg'] ) ) : 1; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only page number.
	return max( 1, $pg );
}

/**
 * Whether the current page is one of WooCommerce's cart, checkout, account or shop pages. The page ids are checked directly
 * as well as through WooCommerce's conditionals, which only fire when the page content holds the cart/checkout block or shortcode.
 */
function ideatoapps_seo_is_woo_page(): bool {
	if ( function_exists( 'is_cart' ) && ( is_cart() || is_checkout() || is_account_page() || is_shop() ) ) {
		return true;
	}
	if ( ! is_page() ) {
		return false;
	}
	foreach ( array( 'cart', 'checkout', 'myaccount', 'shop' ) as $name ) {
		if ( (int) get_option( 'woocommerce_' . $name . '_page_id' ) === get_queried_object_id() ) {
			return true;
		}
	}
	return false;
}

/**
 * Whether the current request must be noindex,follow: private and transactional pages, the WooCommerce product pages (the
 * app page is the public one), search, 404, thin archives and empty modules. Filterable through `ideatoapps_seo_noindex`.
 */
function ideatoapps_seo_is_noindex(): bool {
	$no = is_404() || is_search() || is_attachment() || is_author() || is_date() || is_category() || is_tag() || is_tax() || is_feed()
		|| is_singular( 'product' ) || is_post_type_archive( 'product' )
		|| ideatoapps_seo_is_woo_page()
		|| '' !== ideatoapps_seo_blog_filters()['q'] // a blog search is thin and endless; a category view is a real list and stays indexable.
		|| ideatoapps_seo_module_is_empty();
	return (bool) apply_filters( 'ideatoapps_seo_noindex', $no );
}

add_filter(
	'wp_robots',
	static function ( array $robots ): array {
		if ( ! ideatoapps_seo_enabled() || ! ideatoapps_seo_is_noindex() ) {
			return $robots;
		}
		unset( $robots['index'], $robots['max-image-preview'] );
		$robots['noindex'] = true;
		$robots['follow']  = true;
		return $robots;
	},
	99
);
