<?php
/**
 * WooCommerce pages (cart, checkout, My account): the theme styles them itself, so WooCommerce's own stylesheets are not loaded.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Whether this request is a cart, checkout or account page.
 */
function ideatoapps_is_commerce_page(): bool {
	return function_exists( 'is_cart' ) && ( is_cart() || is_checkout() || is_account_page() );
}

add_filter( 'woocommerce_enqueue_styles', '__return_empty_array' );

add_action(
	'wp_enqueue_scripts',
	static function (): void {
		if ( ideatoapps_is_commerce_page() || is_singular( 'app' ) ) { // app pages print WooCommerce notices (a refused Buy click).
			$file = get_template_directory() . '/assets/css/commerce.css';
			wp_enqueue_style( 'ideatoapps-commerce', get_template_directory_uri() . '/assets/css/commerce.css', array( 'ideatoapps-components' ), (string) filemtime( $file ) );
		}
	},
	20
);

add_filter(
	'body_class',
	static function ( array $classes ): array {
		if ( ideatoapps_is_commerce_page() ) {
			$classes[] = 'is-commerce';
		}
		return $classes;
	}
);
