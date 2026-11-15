<?php
/**
 * Giving existing buyers new versions.
 *
 * WooCommerce only grants download permissions when an order is paid, so a version uploaded later would never reach past
 * buyers without this. Status rules: completed and processing orders qualify; refunded, cancelled, failed, on-hold,
 * pending and draft ones never do. Taking access back is WooCommerce's own job and it does it reliably: a full refund or a
 * cancellation flips the order status and WC_Order::is_download_permitted() then refuses every download, and a refund that
 * names the line item deletes that order's permission rows (wc_create_refund). A line refunded that way is also skipped here
 * (ideatoapps_order_has_active_line), so a later version is not handed back to a refunded buyer.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * IDs of every order (not refund) that has a line for the product, whatever its status.
 *
 * @param int $product_id Product post ID.
 * @return int[]
 */
function ideatoapps_order_ids_for_product( int $product_id ): array {
	global $wpdb;
	$ids = $wpdb->get_col( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->prepare(
			"SELECT DISTINCT i.order_id FROM {$wpdb->prefix}woocommerce_order_items i
			INNER JOIN {$wpdb->prefix}woocommerce_order_itemmeta m ON m.order_item_id = i.order_item_id
			WHERE i.order_item_type = 'line_item' AND m.meta_key = '_product_id' AND m.meta_value = %s",
			(string) $product_id
		)
	);
	return array_map( 'intval', $ids );
}

/**
 * Whether the order still has an un-refunded line for the product.
 *
 * @param WC_Order $order      Order.
 * @param int      $product_id Product post ID.
 * @return bool
 */
function ideatoapps_order_has_active_line( WC_Order $order, int $product_id ): bool {
	foreach ( $order->get_items() as $item_id => $item ) {
		if ( (int) $item->get_product_id() === $product_id && abs( (int) $order->get_qty_refunded_for_item( $item_id ) ) < (int) $item->get_quantity() ) {
			return true;
		}
	}
	return false;
}

/**
 * Grant one version's download to every completed or processing order of the app's product that lacks it.
 * Idempotent: an order that already holds the permission is skipped, so a second run returns 0.
 * Returns 0 for an unknown version, a version without a valid file, or an app without a valid product.
 *
 * @param int    $app_id  App post ID.
 * @param string $version Version that was added or got its file.
 * @return int Number of orders that were newly granted.
 */
function ideatoapps_grant_new_version( int $app_id, string $version ): int {
	$product = ideatoapps_app_product( $app_id );
	if ( ! $product || ! ideatoapps_is_semver( $version ) ) {
		return 0;
	}
	$download_id = ideatoapps_download_id( $app_id, $version );
	if ( ! $product->has_file( $download_id ) ) {
		return 0; // not a version of this app, or its file is missing or invalid: there is nothing to grant.
	}
	$store   = WC_Data_Store::load( 'customer-download' );
	$granted = 0;
	foreach ( ideatoapps_order_ids_for_product( $product->get_id() ) as $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order instanceof WC_Order || ! in_array( $order->get_status(), array( 'completed', 'processing' ), true ) ) {
			continue;
		}
		if ( ! ideatoapps_order_has_active_line( $order, $product->get_id() ) ) {
			continue;
		}
		$existing = $store->get_downloads(
			array(
				'order_id'    => $order_id,
				'product_id'  => $product->get_id(),
				'download_id' => $download_id,
				'return'      => 'ids',
			)
		);
		if ( $existing ) {
			continue;
		}
		if ( wc_downloadable_file_permission( $download_id, $product, $order ) ) {
			++$granted;
		}
	}
	return $granted;
}
