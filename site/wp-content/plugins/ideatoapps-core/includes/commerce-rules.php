<?php
/**
 * Store rules the site depends on. Forced with `pre_option_*` so a settings change in wp-admin cannot undo them:
 * accounts are required to buy, downloads need a login, and a download is always streamed by WooCommerce
 * (never a redirect to the file's address). Prices come only from the product (see the tests), never from the request.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Options WooCommerce reads that this site pins.
 *
 * @return array<string, string>
 */
function ideatoapps_forced_commerce_options(): array {
	return array(
		'woocommerce_enable_guest_checkout'               => 'no',  // an account is needed to buy.
		'woocommerce_enable_signup_and_login_from_checkout' => 'yes', // ...and can be created at checkout.
		'woocommerce_enable_myaccount_registration'       => 'yes',
		'woocommerce_registration_generate_password'      => 'no',  // the buyer chooses their own password.
		'woocommerce_downloads_require_login'             => 'yes', // a download link works only for the logged-in buyer.
		'woocommerce_file_download_method'                => 'force',
		'woocommerce_downloads_redirect_fallback_allowed' => 'no',
		'woocommerce_currency'                            => 'USD', // the site sells in USD only.
		'woocommerce_coming_soon'                         => 'no',  // WooCommerce's own "coming soon" mode would hide cart and checkout; hiding the site is a separate decision.
	);
}

foreach ( ideatoapps_forced_commerce_options() as $ideatoapps_option => $ideatoapps_value ) {
	add_filter(
		'pre_option_' . $ideatoapps_option,
		static function () use ( $ideatoapps_value ) {
			return $ideatoapps_value;
		}
	);
}

/**
 * The app that owns a product (via the tag the sync and the seed write), or 0 for an ordinary product.
 *
 * @param WC_Product $product Product.
 * @return int
 */
function ideatoapps_product_app_id( $product ): int {
	return $product instanceof WC_Product ? (int) get_post_meta( $product->get_id(), '_ideatoapps_app_id', true ) : 0;
}

/**
 * Buy gate: an app's product can only be bought while the app is live and a valid version file exists. Whatever the
 * button shows, a crafted ?add-to-cart= URL gets the same answer.
 *
 * @param bool       $purchasable Current answer.
 * @param WC_Product $product     Product.
 * @return bool
 */
function ideatoapps_gate_purchasable( $purchasable, $product ) {
	$app_id = ideatoapps_product_app_id( $product );
	if ( ! $purchasable || $app_id <= 0 ) {
		return $purchasable;
	}
	return ideatoapps_app_is_sellable( $app_id ) && (int) get_post_meta( $app_id, 'woo_product_id', true ) === $product->get_id();
}
add_filter( 'woocommerce_is_purchasable', 'ideatoapps_gate_purchasable', 20, 2 );

/**
 * One licence per account: an app product is sold individually.
 *
 * @param bool       $individually Current answer.
 * @param WC_Product $product      Product.
 * @return bool
 */
function ideatoapps_sold_individually( $individually, $product ) {
	return ideatoapps_product_app_id( $product ) > 0 ? true : $individually;
}
add_filter( 'woocommerce_is_sold_individually', 'ideatoapps_sold_individually', 10, 2 );

/**
 * After "Buy": go straight to checkout.
 *
 * @param string $url Redirect.
 * @return string
 */
function ideatoapps_add_to_cart_redirect( $url ) {
	return wc_get_checkout_url();
}
add_filter( 'woocommerce_add_to_cart_redirect', 'ideatoapps_add_to_cart_redirect' );

/**
 * Clicking Buy again while the app is already in the cart goes to checkout (WooCommerce would refuse a second copy and
 * leave the visitor on the app page).
 */
function ideatoapps_buy_again_goes_to_checkout(): void {
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a read-only redirect decision, nothing is changed.
	$product_id = isset( $_GET['add-to-cart'] ) ? absint( wp_unslash( $_GET['add-to-cart'] ) ) : 0;
	if ( $product_id > 0 && function_exists( 'WC' ) && WC()->cart && ideatoapps_product_app_id( wc_get_product( $product_id ) ) > 0 && WC()->cart->find_product_in_cart( WC()->cart->generate_cart_id( $product_id ) ) ) {
		wp_safe_redirect( wc_get_checkout_url() );
		exit;
	}
}
add_action( 'wp_loaded', 'ideatoapps_buy_again_goes_to_checkout', 15 );

/**
 * A download is a virtual product: ask only for what an order needs (name, email, country), not an address or phone.
 *
 * @param array $fields Checkout fields.
 * @return array
 */
function ideatoapps_checkout_fields( $fields ) {
	foreach ( array( 'billing_company', 'billing_address_1', 'billing_address_2', 'billing_city', 'billing_state', 'billing_postcode', 'billing_phone' ) as $key ) {
		unset( $fields['billing'][ $key ] );
	}
	return $fields;
}
add_filter( 'woocommerce_checkout_fields', 'ideatoapps_checkout_fields' );

/**
 * No coupon prompt at checkout: nothing is discounted on this site, and WooCommerce's "Click here to enter your code" link
 * fails the accessible-name rule (its aria-label does not contain its visible text). The cart page keeps its coupon field.
 */
add_action(
	'init',
	static function () {
		remove_action( 'woocommerce_before_checkout_form', 'woocommerce_checkout_coupon_form', 10 );
	},
	20
);

/**
 * Account menu: Downloads is the customer's library.
 *
 * @param array $items Menu items.
 * @return array
 */
function ideatoapps_account_menu( $items ) {
	if ( isset( $items['downloads'] ) ) {
		$items['downloads'] = __( 'My library', 'ideatoapps-core' );
	}
	return $items;
}
add_filter( 'woocommerce_account_menu_items', 'ideatoapps_account_menu' );
add_filter(
	'woocommerce_endpoint_downloads_title',
	static function () {
		return __( 'My library', 'ideatoapps-core' );
	}
);

/**
 * Cart and checkout pages are the classic shortcode pages (the theme styles and templates those), not the block
 * versions WooCommerce installs by default. Runs once per plugin version; owner edits to a page made later are kept.
 */
function ideatoapps_use_classic_commerce_pages(): void {
	if ( ! ideatoapps_woocommerce_active() || get_option( 'ideatoapps_classic_pages' ) === IDEATOAPPS_CORE_VERSION ) {
		return;
	}
	foreach ( array(
		'cart'     => '[woocommerce_cart]',
		'checkout' => '[woocommerce_checkout]',
	) as $page => $shortcode ) {
		$id = (int) wc_get_page_id( $page );
		if ( $id > 0 && false !== strpos( (string) get_post_field( 'post_content', $id ), 'wp:woocommerce/' . $page ) ) {
			wp_update_post( array( 'ID' => $id, 'post_content' => $shortcode ) );
		}
	}
	update_option( 'ideatoapps_classic_pages', IDEATOAPPS_CORE_VERSION );
}
add_action( 'init', 'ideatoapps_use_classic_commerce_pages', 30 );
