<?php
final class WordPressBootTest extends WPTestCase {
	public function test_wordpress_and_woocommerce_are_loaded(): void {
		$this->assertTrue( post_type_exists( 'post' ) );
		$this->assertTrue( function_exists( 'wc_create_order' ) );
		$this->assertTrue( class_exists( 'WooCommerce' ) );
		$this->assertSame( 'ideatoapps', get_option( 'template' ) );
	}

	public function test_post_meta_round_trip(): void {
		$id = wp_insert_post( array( 'post_title' => 'Hello', 'post_status' => 'publish' ) );
		$this->assertGreaterThan( 0, $id );
		update_post_meta( $id, '_ita_key', 'value-1' );
		$this->assertSame( 'value-1', get_post_meta( $id, '_ita_key', true ) );
	}

	public function test_downloadable_product_order_grants_download_permission(): void {
		update_option( 'wc_downloads_approved_directories_mode', 'disabled' ); // rolled back after the test
		$product = new WC_Product_Simple();
		$product->set_name( 'Guide' );
		$product->set_regular_price( '10' );
		$product->set_downloadable( true );
		$file = new WC_Product_Download();
		$file->set_id( 'f1' );
		$file->set_name( 'Guide PDF' );
		$file->set_file( 'https://example.org/guide.pdf' );
		$product->set_downloads( array( $file ) );
		$product->save();

		$order = wc_create_order( array( 'customer_id' => 0 ) );
		$order->set_billing_email( 'buyer@example.org' );
		$order->add_product( $product, 1 );
		$order->calculate_totals();
		$order->save();
		$order->update_status( 'completed' );

		$downloads = $order->get_downloadable_items();
		$this->assertCount( 1, $downloads );
		$this->assertSame( 'Guide PDF', $downloads[0]['download_name'] );
		global $wpdb;
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}woocommerce_downloadable_product_permissions WHERE order_id = %d", $order->get_id() ) );
		$this->assertCount( 1, $rows );
		$this->assertSame( 'buyer@example.org', $rows[0]->user_email );
	}

	public function test_state_does_not_leak_between_tests_a(): void {
		update_option( 'ita_leak_probe', 'set' );
		$this->assertSame( 'set', get_option( 'ita_leak_probe' ) );
	}

	public function test_state_does_not_leak_between_tests_b(): void {
		$this->assertFalse( get_option( 'ita_leak_probe' ) );
	}
}
