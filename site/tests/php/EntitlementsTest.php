<?php
require_once __DIR__ . '/CommerceTestCase.php';

final class EntitlementsTest extends CommerceTestCase {
	public function test_buyer_receives_all_current_versions_on_completed_order(): void {
		$app = $this->app();
		$this->add_version( $app, '1.0.0' );
		$this->add_version( $app, '1.1.0' );
		$user  = $this->customer();
		$order = $this->order( $app, $user, 'completed' );
		$this->assertSame( $this->ids( $app, array( '1.0.0', '1.1.0' ) ), $this->granted( $order ) );
		$names = array_column( wc_get_customer_available_downloads( $user ), 'download_name' );
		sort( $names );
		$this->assertSame( array( 'ClipForge 1.0.0', 'ClipForge 1.1.0' ), $names );
	}

	public function test_new_version_granted_to_past_completed_buyer(): void {
		$app = $this->app();
		$this->add_version( $app, '1.0.0' );
		$done = $this->order( $app, $this->customer( 'a' ), 'completed' );
		$proc = $this->order( $app, $this->customer( 'b' ), 'processing' );
		$this->assertSame( $this->ids( $app, array( '1.0.0' ) ), $this->granted( $done ) );
		$this->add_version( $app, '1.1.0', 'Fixes.' ); // the version hook syncs the product and grants.
		$this->assertSame( $this->ids( $app, array( '1.0.0', '1.1.0' ) ), $this->granted( $done ) );
		$this->assertSame( $this->ids( $app, array( '1.0.0', '1.1.0' ) ), $this->granted( $proc ) );
		$user = (int) $done->get_customer_id();
		$this->assertCount( 2, wc_get_customer_available_downloads( $user ), 'shown in the library with no action by the buyer' );
	}

	public function test_refunded_order_not_granted_new_version(): void {
		$app = $this->app();
		$this->add_version( $app, '1.0.0' );
		$orders = array();
		foreach ( array( 'on-hold', 'pending', 'failed', 'cancelled' ) as $status ) {
			$orders[ $status ] = $this->order( $app, $this->customer(), $status );
		}
		$refunded = $this->order( $app, $this->customer(), 'completed' );
		wc_create_refund( array( 'order_id' => $refunded->get_id(), 'amount' => $refunded->get_total(), 'line_items' => array() ) );
		$refunded->update_status( 'refunded' );
		$good = $this->order( $app, $this->customer(), 'completed' );
		$this->add_version( $app, '1.1.0' );
		foreach ( $orders as $status => $order ) {
			$this->assertSame( array(), $this->granted( wc_get_order( $order->get_id() ) ), "$status must not get access" );
		}
		$this->assertNotContains( ideatoapps_download_id( $app, '1.1.0' ), $this->granted( $refunded ), 'refunded order must not get the new version' );
		$this->assertContains( ideatoapps_download_id( $app, '1.1.0' ), $this->granted( $good ) );
	}

	public function test_refund_after_grant_revokes_access(): void {
		$app = $this->app();
		$this->add_version( $app, '1.0.0' );
		$user  = $this->customer();
		$order = $this->order( $app, $user, 'completed' );
		$this->assertCount( 1, wc_get_customer_available_downloads( $user ) );
		$item = array_values( $order->get_items() )[0];
		wc_create_refund( array( 'order_id' => $order->get_id(), 'amount' => $order->get_total(), 'line_items' => array( $item->get_id() => array( 'qty' => 1, 'refund_total' => $order->get_total() ) ) ) );
		$this->assertSame( array(), $this->granted( $order ), 'line fully refunded: permissions deleted' );
		$this->assertCount( 0, wc_get_customer_available_downloads( $user ) );
		$this->assertSame( 0, ideatoapps_grant_new_version( $app, '1.0.0' ), 'and a re-run does not give it back' );
	}

	public function test_a_refunded_line_of_a_still_paid_order_does_not_get_later_versions(): void {
		$app = $this->app();
		$this->add_version( $app, '1.0.0' );
		$other = new WC_Product_Simple();
		$other->set_name( 'Other' );
		$other->set_regular_price( '5' );
		$other->save();
		$user    = $this->customer();
		$product = wc_get_product( (int) get_post_meta( $app, 'woo_product_id', true ) );
		$order   = wc_create_order( array( 'customer_id' => $user ) );
		$order->set_billing_email( get_userdata( $user )->user_email );
		$order->add_product( $product, 1 );
		$order->add_product( $other, 1 );
		$order->calculate_totals();
		$order->save();
		$order->update_status( 'completed' );
		$clip = array_values( array_filter( $order->get_items(), static fn( $i ) => (int) $i->get_product_id() === $product->get_id() ) )[0];
		wc_create_refund( array( 'order_id' => $order->get_id(), 'amount' => '24.99', 'line_items' => array( $clip->get_id() => array( 'qty' => 1, 'refund_total' => '24.99' ) ) ) );
		$this->assertSame( 'completed', wc_get_order( $order->get_id() )->get_status(), 'the order is still paid for the other line' );
		$this->assertSame( array(), $this->granted( $order ), 'WooCommerce deleted the refunded line permissions' );
		$this->add_version( $app, '1.1.0' );
		$this->assertSame( 0, ideatoapps_grant_new_version( $app, '1.1.0' ) );
		$this->assertSame( array(), $this->granted( $order ), 'the refunded line is not handed the new version' );
	}

	public function test_second_run_is_idempotent(): void {
		$app = $this->app();
		$this->add_version( $app, '1.0.0' );
		$order = $this->order( $app, $this->customer(), 'completed' );
		remove_action( 'ideatoapps_version_changed', 'ideatoapps_on_version_changed', 10 );
		$att = $this->zip_attachment( 'ClipForge-1.1.0.zip' );
		ideatoapps_add_version( $app, '1.1.0', 'x', $att );
		ideatoapps_sync_product_downloads( $app );
		$this->assertSame( 1, ideatoapps_grant_new_version( $app, '1.1.0' ) );
		$this->assertSame( 0, ideatoapps_grant_new_version( $app, '1.1.0' ), 'second run grants nothing' );
		$this->assertSame( 0, ideatoapps_grant_new_version( $app, '1.0.0' ), 'already granted by the order itself' );
		$this->assertSame( $this->ids( $app, array( '1.0.0', '1.1.0' ) ), $this->granted( $order ), 'no duplicate rows' );
		ideatoapps_sync_product_downloads( $app );
		ideatoapps_sync_product_downloads( $app );
		$this->assertCount( 2, wc_get_product( (int) get_post_meta( $app, 'woo_product_id', true ) )->get_downloads() );
		add_action( 'ideatoapps_version_changed', 'ideatoapps_on_version_changed', 10, 3 );
	}

	public function test_sync_names_files_after_the_app_and_keeps_download_ids_stable(): void {
		$app = $this->app();
		wp_update_post( array( 'ID' => $app, 'post_title' => 'Other Name' ) );
		$this->add_version( $app, '1.0.0' );
		$product = wc_get_product( (int) get_post_meta( $app, 'woo_product_id', true ) );
		$files   = $product->get_downloads();
		$this->assertSame( array( ideatoapps_download_id( $app, '1.0.0' ) ), array_keys( $files ) );
		$this->assertSame( 'Other Name 1.0.0', $files[ ideatoapps_download_id( $app, '1.0.0' ) ]->get_name() );
		$this->assertTrue( $product->is_downloadable() && $product->is_virtual() );
		$this->assertSame( -1, (int) $product->get_download_limit() );
		$this->assertSame( -1, (int) $product->get_download_expiry() );
	}

	public function test_removing_a_version_is_safe_and_withdraws_the_file_for_everyone(): void {
		$app = $this->app();
		$this->add_version( $app, '1.0.0' );
		$this->add_version( $app, '1.1.0' );
		$user  = $this->customer();
		$order = $this->order( $app, $user, 'completed' );
		$this->assertFalse( ideatoapps_remove_version( $app, '9.9.9' ), 'missing version: no crash, no change' );
		$this->assertSame( 0, ideatoapps_grant_new_version( $app, '9.9.9' ) );
		$this->assertTrue( ideatoapps_remove_version( $app, '1.1.0' ) );
		$this->assertSame( array( 'ClipForge 1.0.0' ), array_column( wc_get_customer_available_downloads( $user ), 'download_name' ) );
		$this->assertContains( ideatoapps_download_id( $app, '1.1.0' ), $this->granted( $order ), 'permission rows are kept (dormant)' );
		$this->assertSame( 0, ideatoapps_grant_new_version( $app, '1.1.0' ) );
		$this->add_version( $app, '1.1.0', 'Back.' ); // the same number again restores access.
		$this->assertCount( 2, wc_get_customer_available_downloads( $user ) );
		foreach ( array( '1.0.0', '1.1.0' ) as $v ) {
			ideatoapps_remove_version( $app, $v );
		}
		$this->assertTrue( ideatoapps_app_product( $app )->is_downloadable() );
		$this->assertSame( array(), ideatoapps_app_product( $app )->get_downloads() );
		$this->assertFalse( ideatoapps_app_is_sellable( $app ) );
	}

	public function test_replayed_payment_notification_does_not_duplicate_order_or_access(): void {
		$app = $this->app();
		$this->add_version( $app, '1.0.0' );
		$order = $this->order( $app, $this->customer(), 'pending' );
		for ( $i = 0; $i < 3; $i++ ) { // a gateway webhook delivered (or replayed) three times.
			wc_get_order( $order->get_id() )->payment_complete( 'pi_test_replay' );
			wc_get_order( $order->get_id() )->update_status( 'completed' );
		}
		$this->assertCount( 1, wc_get_orders( array( 'limit' => -1, 'return' => 'ids' ) ), 'still one order' );
		$this->assertSame( $this->ids( $app, array( '1.0.0' ) ), $this->granted( wc_get_order( $order->get_id() ) ), 'one permission, not three' );
	}
}
