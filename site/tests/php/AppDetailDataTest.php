<?php
final class AppDetailDataTest extends WPTestCase {
	private function app( array $meta = array(), string $title = 'Detail App', array $post = array() ): int {
		return wp_insert_post( array_merge( array( 'post_type' => 'app', 'post_title' => $title, 'post_status' => 'publish', 'meta_input' => $meta + array( 'delivery_status' => 'live' ) ), $post ) );
	}

	public function test_public_versions_expose_version_date_and_changelog_only(): void {
		$id = $this->app();
		ideatoapps_add_version( $id, '1.0.0', 'First', 123 );
		ideatoapps_add_version( $id, '1.2.0', 'Third', 456 );
		$rows = ideatoapps_public_versions( $id );
		$this->assertSame( array( '1.2.0', '1.0.0' ), array_column( $rows, 'version' ) );
		foreach ( $rows as $row ) {
			$this->assertSame( array( 'version', 'released', 'changelog' ), array_keys( $row ) );
		}
		$this->assertSame( array(), ideatoapps_public_versions( $this->app( array(), 'No versions' ) ) );
	}

	public function test_features_and_faq_drop_blank_and_malformed_rows(): void {
		$id = $this->app( array( 'features' => wp_json_encode( array( 'One', '', '  ', 'Two' ) ), 'faq' => wp_json_encode( array( array( 'q' => 'Q1', 'a' => 'A1' ), array( 'q' => '', 'a' => 'x' ), array( 'q' => 'Q only', 'a' => '' ) ) ) ) );
		$this->assertSame( array( 'One', 'Two' ), ideatoapps_app_features( $id ) );
		$this->assertSame( array( array( 'q' => 'Q1', 'a' => 'A1' ) ), ideatoapps_app_faq( $id ) );
		$this->assertSame( array(), ideatoapps_app_features( $this->app( array(), 'Bare' ) ) );
	}

	public function test_visibility_rule(): void {
		$this->assertTrue( ideatoapps_app_is_visible( get_post( $this->app( array( 'delivery_status' => 'live' ) ) ) ) );
		$this->assertTrue( ideatoapps_app_is_visible( get_post( $this->app( array( 'delivery_status' => 'coming_soon' ), 'S' ) ) ) );
		$this->assertFalse( ideatoapps_app_is_visible( get_post( $this->app( array( 'delivery_status' => 'draft' ), 'D' ) ) ) );
		$this->assertFalse( ideatoapps_app_is_visible( get_post( $this->app( array(), 'E', array( 'post_status' => 'draft' ) ) ) ) );
	}

	public function test_buy_state(): void {
		$product = new WC_Product_Simple();
		$product->set_name( 'P' );
		$product->set_regular_price( '5' );
		$pid = $product->save();
		$live = $this->app( array( 'woo_product_id' => $pid, 'price_label' => '$5.00 one-time' ), 'Buyable' );
		$buy  = ideatoapps_app_buy_state( get_post( $live ) );
		$this->assertSame( 'buy', $buy['kind'] );
		$this->assertSame( 'Buy Buyable, $5.00 one-time', $buy['label'] );
		$this->assertSame( add_query_arg( 'add-to-cart', $pid, get_permalink( $live ) ), $buy['href'] );

		$this->assertSame( 'Buy NoPrice', ideatoapps_app_buy_state( get_post( $this->app( array( 'woo_product_id' => $pid ), 'NoPrice' ) ) )['label'] );
		$this->assertSame( 'none', ideatoapps_app_buy_state( get_post( $this->app( array(), 'No product' ) ) )['kind'] );
		$this->assertSame( 'none', ideatoapps_app_buy_state( get_post( $this->app( array( 'woo_product_id' => 999999 ), 'Missing product' ) ) )['kind'] );
		$soon = ideatoapps_app_buy_state( get_post( $this->app( array( 'delivery_status' => 'coming_soon', 'woo_product_id' => $pid, 'price_label' => '$5.00' ), 'Soon' ) ) );
		$this->assertSame( array( 'kind' => 'soon' ), $soon );
	}

	public function test_related_apps_are_other_live_apps_only(): void {
		$me = $this->app( array(), 'Me' );
		$this->assertSame( array(), ideatoapps_related_apps( $me ) );
		$this->app( array( 'delivery_status' => 'coming_soon' ), 'Soon' );
		$this->app( array( 'delivery_status' => 'draft' ), 'Hidden' );
		$this->app( array(), 'Unpublished', array( 'post_status' => 'draft' ) );
		$this->assertSame( array(), ideatoapps_related_apps( $me ) );
		$other = $this->app( array(), 'Other' );
		$this->assertSame( array( $other ), wp_list_pluck( ideatoapps_related_apps( $me ), 'ID' ) );
	}

	public function test_action_links_only_when_http_or_https(): void {
		$id = $this->app( array( 'launch_url' => 'https://example.org/l', 'demo_url' => 'http://example.org/d' ) );
		$this->assertSame( array( 'launch' => 'https://example.org/l', 'demo' => 'http://example.org/d' ), ideatoapps_app_action_links( $id ) );
		$id2 = $this->app( array(), 'None' );
		$this->assertSame( array(), ideatoapps_app_action_links( $id2 ) );
		update_post_meta( $id2, 'launch_url', 'javascript:alert(1)' ); // sanitise removes it; also guard at read time
		$this->assertSame( array(), ideatoapps_app_action_links( $id2 ) );
	}
}
