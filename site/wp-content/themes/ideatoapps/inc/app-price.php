<?php
/**
 * The price a visitor sees. WooCommerce charges the product price, so that is what the Buy button, the card, the FAQ and
 * the terms show. The free-text "Price label" is only the fallback for an app with no usable linked product.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The linked product's price as plain text ("$24.99"), or '' when the app has no linked, published product with a
 * numeric price (or WooCommerce is off). Uses the active price, so a sale price is what is shown, as it is what is charged.
 *
 * @param int $app_id App post ID.
 * @return string
 */
function ideatoapps_app_product_price( int $app_id ): string {
	if ( ! function_exists( 'ideatoapps_app_product' ) || ! function_exists( 'wc_price' ) ) {
		return '';
	}
	// Same eligibility as the buy gate and the JSON-LD offer: a valid simple product this app owns, and published.
	// (A variable product has no single price, so it falls back to the label. No query beyond what the card already runs:
	// post meta and the product are cached by WordPress after the first read.)
	$product = ideatoapps_app_product( $app_id );
	if ( ! $product || 'publish' !== $product->get_status() ) {
		return '';
	}
	$price = (string) $product->get_price();
	if ( '' === $price || ! is_numeric( $price ) ) {
		return '';
	}
	return html_entity_decode( wp_strip_all_tags( wc_price( (float) $price ) ), ENT_QUOTES, 'UTF-8' );
}

/**
 * The price text for the Buy button and the card: "$24.99 one-time" from the product, else the text label, else ''.
 *
 * @param int $app_id App post ID.
 * @return string
 */
function ideatoapps_app_price_text( int $app_id ): string {
	$amount = ideatoapps_app_product_price( $app_id );
	if ( '' !== $amount ) {
		/* translators: %s: price such as "$24.99". Every app is a one-time purchase. */
		return sprintf( __( '%s one-time', 'ideatoapps' ), $amount );
	}
	return trim( (string) get_post_meta( $app_id, 'price_label', true ) );
}

/**
 * The ClipForge price for running text (FAQ, terms): "$24.99 USD" from the ClipForge app's product when it exists, else
 * the launch price. Ruling: the fallback is the one number the site launches with, used only while no product is linked.
 *
 * @return string
 */
function ideatoapps_clipforge_price_text(): string {
	$ids    = get_posts(
		array(
			'post_type'        => 'app',
			'post_status'      => 'publish',
			'name'             => 'clipforge',
			'numberposts'      => 1,
			'fields'           => 'ids',
			'suppress_filters' => true,
		)
	);
	$amount = $ids ? ideatoapps_app_product_price( (int) $ids[0] ) : '';
	$code   = function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'USD';
	return '' !== $amount ? $amount . ' ' . $code : '$24.99 USD';
}
