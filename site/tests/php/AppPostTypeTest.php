<?php
final class AppPostTypeTest extends WPTestCase {
	private function make_app( array $meta = array() ): int {
		return wp_insert_post( array( 'post_type' => 'app', 'post_title' => 'Demo', 'post_status' => 'publish', 'meta_input' => $meta ) );
	}

	public function test_app_post_type_registered(): void {
		$pt = get_post_type_object( 'app' );
		$this->assertNotNull( $pt );
		$this->assertTrue( $pt->public );
		$this->assertSame( 'apps', $pt->has_archive );
		$this->assertSame( 'apps', $pt->rewrite['slug'] );
		$this->assertTrue( $pt->show_in_rest );
		foreach ( array( 'title', 'editor', 'thumbnail', 'excerpt', 'revisions' ) as $feature ) {
			$this->assertTrue( post_type_supports( 'app', $feature ), $feature );
		}
	}

	public function test_app_category_taxonomy(): void {
		$tax = get_taxonomy( 'app_category' );
		$this->assertNotFalse( $tax );
		$this->assertTrue( $tax->hierarchical );
		$this->assertTrue( $tax->show_in_rest );
		$this->assertContains( 'app', $tax->object_type );
	}

	public function test_meta_registered_for_rest(): void {
		$keys = array( 'tagline', 'platforms', 'price_label', 'launch_url', 'demo_url', 'video_id', 'faq', 'features', 'delivery_status', 'woo_product_id' );
		foreach ( $keys as $key ) {
			$this->assertTrue( registered_meta_key_exists( 'post', $key, 'app' ), $key );
		}
	}

	public function test_meta_sanitised(): void {
		$id = $this->make_app();
		update_post_meta( $id, 'tagline', 'Hi <script>alert(1)</script><b>there</b>' );
		$this->assertStringNotContainsString( '<', get_post_meta( $id, 'tagline', true ) );
		$this->assertSame( 'Hi there', get_post_meta( $id, 'tagline', true ) );
	}

	public function test_urls_must_be_http_or_https(): void {
		$id = $this->make_app();
		update_post_meta( $id, 'launch_url', 'javascript:alert(1)' );
		$this->assertSame( '', get_post_meta( $id, 'launch_url', true ) );
		update_post_meta( $id, 'demo_url', 'ftp://example.org/x' );
		$this->assertSame( '', get_post_meta( $id, 'demo_url', true ) );
		update_post_meta( $id, 'launch_url', 'https://example.org/app' );
		$this->assertSame( 'https://example.org/app', get_post_meta( $id, 'launch_url', true ) );
	}

	public function test_delivery_status_whitelist(): void {
		$id = $this->make_app();
		update_post_meta( $id, 'delivery_status', 'live' );
		$this->assertSame( 'live', get_post_meta( $id, 'delivery_status', true ) );
		update_post_meta( $id, 'delivery_status', 'bogus' );
		$this->assertSame( 'draft', get_post_meta( $id, 'delivery_status', true ) );
		$this->assertSame( 'draft', get_registered_meta_keys( 'post', 'app' )['delivery_status']['default'] );
	}

	public function test_json_meta_validated(): void {
		$id = $this->make_app();
		update_post_meta( $id, 'faq', '{not json' );
		$this->assertSame( '[]', get_post_meta( $id, 'faq', true ) );
		update_post_meta( $id, 'faq', '[{"q":"Q <b>1</b>","a":"A1"},{"x":1},"str"]' );
		$this->assertSame( array( array( 'q' => 'Q 1', 'a' => 'A1' ) ), json_decode( get_post_meta( $id, 'faq', true ), true ) );
		update_post_meta( $id, 'features', '["One <i>x</i>","Two",5]' );
		$this->assertSame( array( 'One x', 'Two' ), json_decode( get_post_meta( $id, 'features', true ), true ) );
		update_post_meta( $id, 'features', '"scalar"' );
		$this->assertSame( '[]', get_post_meta( $id, 'features', true ) );
	}

	public function test_woo_product_id_is_int(): void {
		$id = $this->make_app();
		update_post_meta( $id, 'woo_product_id', '42abc' );
		$this->assertSame( 42, (int) get_post_meta( $id, 'woo_product_id', true ) );
		update_post_meta( $id, 'woo_product_id', -5 );
		$this->assertSame( 5, (int) get_post_meta( $id, 'woo_product_id', true ) );
	}

	public function test_auth_callback_requires_edit_post(): void {
		$id = $this->make_app();
		wp_set_current_user( self::factory_user( 'subscriber' ) );
		foreach ( array( 'tagline', 'faq', 'delivery_status', 'woo_product_id' ) as $key ) {
			$this->assertFalse( current_user_can( 'edit_post_meta', $id, $key ), $key );
		}
		$sub = get_current_user_id();
		$this->assertFalse( ideatoapps_meta_auth( true, 'tagline', $id, $sub ) );
		$this->assertSame( 'ideatoapps_meta_auth', get_registered_meta_keys( 'post', 'app' )['tagline']['auth_callback'] );
		wp_set_current_user( self::factory_user( 'administrator' ) );
		$this->assertTrue( current_user_can( 'edit_post_meta', $id, 'tagline' ) );
		$this->assertTrue( ideatoapps_meta_auth( false, 'tagline', $id, get_current_user_id() ) );
	}

	public static function factory_user( string $role ): int {
		return wp_insert_user( array( 'user_login' => $role . wp_generate_password( 6, false ), 'user_pass' => wp_generate_password(), 'role' => $role ) );
	}
}
