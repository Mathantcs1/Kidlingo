<?php
require_once __DIR__ . '/CommerceTestCase.php';

final class CommerceGateTest extends CommerceTestCase {
	private function pid( int $app ): int {
		return (int) get_post_meta( $app, 'woo_product_id', true );
	}

	public function test_price_is_2499_usd_and_not_editable_from_request(): void {
		$app = $this->app();
		$this->add_version( $app, '1.0.0' );
		$pid = $this->pid( $app );
		$this->assertSame( 'USD', get_woocommerce_currency() );
		update_option( 'woocommerce_currency', 'EUR' ); // a settings change cannot switch the currency.
		$this->assertSame( 'USD', get_woocommerce_currency() );
		$_REQUEST = $_POST = $_GET = array( 'add-to-cart' => $pid, 'price' => '0.01', 'cart_item_data' => array( 'price' => 1 ), 'quantity' => 5 );
		wc_load_cart();
		WC()->cart->empty_cart();
		$this->assertNotFalse( WC()->cart->add_to_cart( $pid, 5, 0, array(), array( 'price' => '0.01' ) ) );
		WC()->cart->calculate_totals();
		$this->assertSame( '24.99', wc_format_decimal( WC()->cart->get_total( 'edit' ), 2 ), 'request values never reach the price' );
		$this->assertSame( 1, array_values( WC()->cart->get_cart() )[0]['quantity'], 'sold individually: one licence' );
		$_REQUEST = $_POST = $_GET = array();
		$editor = $this->make_user( 'editor' );
		wp_set_current_user( $editor );
		$this->assertFalse( current_user_can( 'edit_post', $pid ), 'an editor cannot edit the price' );
		$req = new WP_REST_Request( 'PUT', '/wc/v3/products/' . $pid );
		$req->set_body_params( array( 'regular_price' => '0.01' ) );
		$this->assertGreaterThanOrEqual( 401, rest_do_request( $req )->get_status() );
		$this->assertSame( '24.99', wc_get_product( $pid )->get_regular_price() );
	}

	public function test_store_rules_are_pinned(): void {
		foreach ( array( 'woocommerce_enable_guest_checkout' => 'yes', 'woocommerce_downloads_require_login' => 'no', 'woocommerce_file_download_method' => 'redirect', 'woocommerce_enable_signup_and_login_from_checkout' => 'no' ) as $k => $v ) {
			update_option( $k, $v );
		}
		$this->assertSame( 'no', get_option( 'woocommerce_enable_guest_checkout' ) );
		$this->assertTrue( WC()->checkout()->is_registration_required() );
		$this->assertTrue( WC()->checkout()->is_registration_enabled() );
		$this->assertSame( 'yes', get_option( 'woocommerce_downloads_require_login' ) );
		$this->assertSame( 'force', get_option( 'woocommerce_file_download_method' ) );
		update_option( 'woocommerce_coming_soon', 'yes' );
		$this->assertSame( 'no', get_option( 'woocommerce_coming_soon' ), 'the store-pages coming-soon screen must never cover cart and checkout' );
		$this->assertFalse( has_action( 'woocommerce_before_checkout_form', 'woocommerce_checkout_coupon_form' ), 'no coupon prompt at checkout' );
		$fields = WC()->checkout()->get_checkout_fields( 'billing' );
		$this->assertArrayHasKey( 'billing_email', $fields );
		$this->assertArrayNotHasKey( 'billing_phone', $fields );
	}

	public function test_buy_is_gated_until_a_valid_file_exists(): void {
		$app = $this->app();
		$pid = $this->pid( $app );
		$this->assertFalse( wc_get_product( $pid )->is_purchasable(), 'seeded but no zip yet: crafted add-to-cart must fail too' );
		$this->assertSame( array( 'kind' => 'soon' ), ideatoapps_app_buy_state( get_post( $app ) ) );
		wc_load_cart();
		WC()->cart->empty_cart();
		$this->assertFalse( WC()->cart->add_to_cart( $pid ) );
		$this->add_version( $app, '1.0.0' );
		$this->assertTrue( wc_get_product( $pid )->is_purchasable() );
		$buy = ideatoapps_app_buy_state( get_post( $app ) );
		$this->assertSame( 'buy', $buy['kind'] );
		$this->assertSame( 'Buy ClipForge, $24.99 one-time', $buy['label'] );
		$this->assertNotFalse( WC()->cart->add_to_cart( $pid ) );
		$this->assertTrue( ideatoapps_app_is_sellable( $app ) );
		update_post_meta( $app, 'delivery_status', 'coming_soon' );
		$this->assertFalse( wc_get_product( $pid )->is_purchasable() );
		update_post_meta( $app, 'delivery_status', 'live' );
		$this->assertTrue( wc_get_product( $pid )->is_purchasable() );
	}

	public function test_a_version_without_a_valid_file_never_opens_the_buy_button(): void {
		$app = $this->app();
		$page = wp_insert_post( array( 'post_type' => 'page', 'post_title' => 'x', 'post_status' => 'publish' ) );
		$text = $this->zip_attachment( 'notes.zip', 'hello, not a zip' );
		$txt  = $this->zip_attachment( 'ClipForge-1.0.2.txt', "PK\x05\x06" . str_repeat( "\0", 18 ) );
		$out  = $this->zip_attachment( 'ClipForge-1.0.3.zip' );
		update_post_meta( $out, '_wp_attached_file', '../../../../../../../etc/hostname' ); // points outside uploads.
		foreach ( array( 0, 999999, $page, $text, $txt, $out ) as $i => $att ) {
			ideatoapps_add_version( $app, '1.0.' . $i, 'bad', $att );
			$this->assertSame( '', ideatoapps_valid_zip_attachment( (int) $att ), "attachment $att" );
		}
		$this->assertSame( array(), wc_get_product( $this->pid( $app ) )->get_downloads() );
		$this->assertFalse( ideatoapps_app_is_sellable( $app ) );
		$this->assertSame( 'soon', ideatoapps_app_buy_state( get_post( $app ) )['kind'] );
		$this->assertSame( 0, ideatoapps_grant_new_version( $app, '1.0.1' ) );
	}

	public function test_a_real_zip_that_is_not_an_uploads_attachment_is_never_synced(): void {
		$app   = $this->app();
		$outside = sys_get_temp_dir() . '/ita-outside-' . wp_generate_password( 6, false ) . '.zip';
		file_put_contents( $outside, "PK\x05\x06" . str_repeat( "\0", 18 ) );
		$att = $this->zip_attachment( 'inside.zip' );
		update_attached_file( $att, $outside ); // a perfectly good zip, but outside the uploads folder.
		$page = wp_insert_post( array( 'post_type' => 'page', 'post_title' => 'not an attachment', 'post_status' => 'publish' ) );
		update_post_meta( $page, '_wp_attached_file', $outside );
		$good = $this->zip_attachment( 'good.zip' );
		update_post_meta( $page, '_wp_attached_file', str_replace( wp_upload_dir()['basedir'] . '/', '', (string) get_attached_file( $good ) ) ); // a page carrying a valid upload path.
		$this->assertSame( '', ideatoapps_valid_zip_attachment( $att ), 'outside uploads' );
		$this->assertSame( '', ideatoapps_valid_zip_attachment( $page ), 'a page is not an attachment even if it carries an upload path' );
		$this->assertNotSame( '', ideatoapps_valid_zip_attachment( $good ) );
		ideatoapps_add_version( $app, '1.0.0', 'x', $att );
		ideatoapps_add_version( $app, '1.0.1', 'x', $page );
		$this->assertSame( array(), wc_get_product( $this->pid( $app ) )->get_downloads() );
		unlink( $outside );
	}

	public function test_product_link_is_validated(): void {
		$app   = $this->app();
		$other = wp_insert_post( array( 'post_type' => 'app', 'post_title' => 'Other', 'post_status' => 'publish', 'meta_input' => array( 'delivery_status' => 'live' ) ) );
		$page  = wp_insert_post( array( 'post_type' => 'page', 'post_title' => 'Not a product', 'post_status' => 'publish' ) );
		update_post_meta( $other, 'woo_product_id', $page );
		$this->assertNull( ideatoapps_app_product( $other ), 'a page is not a product' );
		update_post_meta( $other, 'woo_product_id', $this->pid( $app ) ); // another app's product.
		$this->assertNull( ideatoapps_app_product( $other ) );
		$this->add_version( $other, '1.0.0' );
		$this->assertSame( array(), wc_get_product( $this->pid( $app ) )->get_downloads(), "the other app cannot rewrite ClipForge's files" );
		update_post_meta( $other, 'woo_product_id', 999999 );
		$this->assertNull( ideatoapps_app_product( $other ) );
		$this->assertSame( 0, ideatoapps_grant_new_version( $other, '1.0.0' ) );
		wp_trash_post( $this->pid( $app ) );
		$this->assertNull( ideatoapps_app_product( $app ) );
		$this->assertFalse( ideatoapps_app_is_sellable( $app ) );
	}
}
