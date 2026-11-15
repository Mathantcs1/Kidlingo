<?php
/**
 * The ClipForge WooCommerce product for the seed: virtual, downloadable, $24.99 USD, no download limit, no expiry.
 * Re-running repairs those structural settings but never resets a price the owner has changed.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Apply the structural settings (and the launch price when there is none) to a product, then save it.
 *
 * @param WC_Product_Simple $product Product.
 * @param int               $app_id  Owning app.
 */
function ideatoapps_seed_configure_product( $product, $app_id ) {
	$product->set_status( 'publish' );
	if ( '' === (string) $product->get_regular_price() ) {
		$product->set_regular_price( '24.99' );
	}
	$product->set_virtual( true );
	$product->set_downloadable( true );
	$product->set_download_limit( -1 );
	$product->set_download_expiry( -1 );
	$product->set_sold_individually( true );
	$product->update_meta_data( '_ideatoapps_app_id', $app_id );
	$product->save();
}

/**
 * The product for an app: the linked one if it still exists, else one tagged for this app (no orphans), else a new one.
 * Products carry `_ideatoapps_app_id` so a re-run finds them.
 *
 * @param int $app_id App post ID.
 * @return int Product ID, 0 when WooCommerce is not available.
 */
function ideatoapps_seed_clipforge_product( $app_id ) {
	if ( ! ideatoapps_woocommerce_active() || ! class_exists( 'WC_Product_Simple' ) ) {
		return 0;
	}
	$linked = (int) get_post_meta( $app_id, 'woo_product_id', true );
	if ( $linked > 0 && 'product' === get_post_type( $linked ) ) {
		ideatoapps_seed_publish_product( $linked );
		ideatoapps_seed_configure_product( wc_get_product( $linked ), $app_id );
		return $linked;
	}
	$found = get_posts(
		array(
			'post_type'      => 'product',
			'post_status'    => array( 'any', 'trash' ),
			'meta_key'       => '_ideatoapps_app_id', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- one row.
			'meta_value'     => $app_id, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			'posts_per_page' => 1,
			'fields'         => 'ids',
		)
	);
	if ( ! $found ) {
		// A product from before products were tagged: same slug as the seed's product name.
		$found = get_posts(
			array(
				'post_type'      => 'product',
				'post_status'    => array( 'any', 'trash' ),
				'post_name__in'  => array( 'clipforge', 'clipforge__trashed' ),
				'posts_per_page' => 1,
				'fields'         => 'ids',
			)
		);
	}
	if ( $found ) {
		$product_id = (int) $found[0];
		ideatoapps_seed_publish_product( $product_id );
		ideatoapps_seed_configure_product( wc_get_product( $product_id ), $app_id );
		return $product_id;
	}
	$product = new WC_Product_Simple();
	$product->set_name( 'ClipForge' );
	ideatoapps_seed_configure_product( $product, $app_id );
	return (int) $product->get_id();
}

/**
 * Bring a trashed seed product back (published); other statuses are left as the owner set them.
 *
 * @param int $product_id Product post ID.
 */
function ideatoapps_seed_publish_product( $product_id ) {
	if ( 'trash' === get_post_status( $product_id ) ) {
		wp_untrash_post( $product_id );
		wp_update_post( array( 'ID' => $product_id, 'post_status' => 'publish' ) );
	}
}
