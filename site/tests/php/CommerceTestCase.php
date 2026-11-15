<?php
require_once __DIR__ . '/WPTestCase.php';

/** Helpers for the commerce tests: a seeded ClipForge, real zip attachments, customers and orders. */
abstract class CommerceTestCase extends WPTestCase {
	/** An attachment holding a real (empty) zip in the PUBLIC uploads folder, as the media library would. */
	protected function zip_attachment( string $name = 'ClipForge-1.0.0.zip', string $bytes = "PK\x05\x06\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0" ): int {
		$up = wp_upload_bits( $name, null, $bytes );
		$this->assertEmpty( $up['error'], (string) $up['error'] );
		return (int) wp_insert_attachment( array( 'post_mime_type' => 'application/zip', 'post_title' => $name, 'post_status' => 'inherit' ), $up['file'] );
	}

	/** The seeded, live ClipForge app (no versions yet). */
	protected function app(): int {
		return ideatoapps_seed_clipforge();
	}

	protected function add_version( int $app, string $version, string $log = 'Notes.' ): int {
		$att = $this->zip_attachment( "ClipForge-$version.zip" );
		$this->assertTrue( ideatoapps_add_version( $app, $version, $log, $att ) );
		return $att;
	}

	protected function customer( string $tag = 'a' ): int {
		$id = wp_insert_user( array( 'user_login' => 'buyer_' . $tag . wp_generate_password( 5, false ), 'user_pass' => 'x', 'user_email' => $tag . wp_generate_password( 5, false ) . '@example.org', 'role' => 'customer' ) );
		$this->assertIsInt( $id );
		return $id;
	}

	protected function order( int $app, int $user, string $status ): WC_Order {
		$product = wc_get_product( (int) get_post_meta( $app, 'woo_product_id', true ) );
		$order   = wc_create_order( array( 'customer_id' => $user ) );
		$order->set_billing_email( get_userdata( $user )->user_email );
		$order->add_product( $product, 1 );
		$order->calculate_totals();
		$order->save();
		$order->update_status( $status );
		return wc_get_order( $order->get_id() );
	}

	/** Download ids this order holds permission for. */
	protected function granted( WC_Order $order ): array {
		global $wpdb;
		$ids = $wpdb->get_col( $wpdb->prepare( "SELECT download_id FROM {$wpdb->prefix}woocommerce_downloadable_product_permissions WHERE order_id = %d", $order->get_id() ) );
		sort( $ids );
		return $ids;
	}

	protected function ids( int $app, array $versions ): array {
		$ids = array_map( static fn( $v ) => ideatoapps_download_id( $app, $v ), $versions );
		sort( $ids );
		return $ids;
	}
}
