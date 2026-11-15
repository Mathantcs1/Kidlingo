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

	/** A live app with its own product. T8: the buy button also needs a version with a real zip, so $zip adds one. */
	private function sellable( array $meta, string $title, bool $zip = true ): int {
		$product = new WC_Product_Simple();
		$product->set_name( 'P ' . $title );
		$product->set_regular_price( '5' );
		$pid = $product->save();
		$id  = $this->app( array( 'woo_product_id' => $pid ) + $meta, $title );
		if ( $zip ) {
			$file = wp_upload_bits( sanitize_title( $title ) . '.zip', null, "PK\x05\x06" . str_repeat( "\0", 18 ) );
			ideatoapps_add_version( $id, '1.0.0', 'First.', (int) wp_insert_attachment( array( 'post_mime_type' => 'application/zip', 'post_title' => $title, 'post_status' => 'inherit' ), $file['file'] ) );
		}
		return $id;
	}

	public function test_buy_state(): void {
		$live = $this->sellable( array( 'price_label' => '$5.00 one-time' ), 'Buyable' );
		$pid  = (int) get_post_meta( $live, 'woo_product_id', true );
		$buy  = ideatoapps_app_buy_state( get_post( $live ) );
		$this->assertSame( 'buy', $buy['kind'] );
		$this->assertSame( 'Buy Buyable, $5.00 one-time', $buy['label'] );
		$this->assertSame( add_query_arg( 'add-to-cart', $pid, get_permalink( $live ) ), $buy['href'] );

		$this->assertSame( 'Buy NoPrice', ideatoapps_app_buy_state( get_post( $this->sellable( array(), 'NoPrice' ) ) )['label'] );
		$this->assertSame( 'none', ideatoapps_app_buy_state( get_post( $this->app( array(), 'No product' ) ) )['kind'] );
		$this->assertSame( 'none', ideatoapps_app_buy_state( get_post( $this->app( array( 'woo_product_id' => 999999 ), 'Missing product' ) ) )['kind'] );
		$soon = ideatoapps_app_buy_state( get_post( $this->sellable( array( 'delivery_status' => 'coming_soon', 'price_label' => '$5.00' ), 'Soon' ) ) );
		$this->assertSame( array( 'kind' => 'soon' ), $soon );
		// Changed in T8: live + published product but no version file yet is "Coming soon", never a live buy button.
		$nofile = ideatoapps_app_buy_state( get_post( $this->sellable( array( 'price_label' => '$5.00' ), 'No file yet', false ) ) );
		$this->assertSame( array( 'kind' => 'soon' ), $nofile );
	}

	public function test_buy_button_needs_a_published_product(): void {
		foreach ( array( 'draft', 'private' ) as $status ) {
			$product = new WC_Product_Simple();
			$product->set_name( 'P ' . $status );
			$product->set_regular_price( '5' );
			$product->set_status( $status );
			$pid = $product->save();
			$id  = $this->app( array( 'woo_product_id' => $pid, 'price_label' => '$5.00' ), 'App ' . $status );
			$this->assertSame( 'none', ideatoapps_app_buy_state( get_post( $id ) )['kind'], $status );
		}
	}

	public function test_schema_seam_is_filled_by_the_plugin_and_never_carries_ratings(): void {
		$id = $this->app();
		$this->assertSame( 'SoftwareApplication', ideatoapps_app_schema( $id )['@type'], 'Task 9: the plugin fills the seam' );
		$dirty = static fn( $s, $pid ) => array( '@type' => 'SoftwareApplication', 'name' => 'X', 'aggregateRating' => array( 'ratingValue' => 5 ), 'review' => array( 'a' ), 'ratingCount' => 3 );
		add_filter( 'ideatoapps_app_schema', $dirty, 11, 2 );
		$schema = ideatoapps_app_schema( $id );
		$this->assertSame( array( '@type' => 'SoftwareApplication', 'name' => 'X' ), $schema );
		ob_start();
		ideatoapps_part( 'app-schema', array( 'app' => get_post( $id ) ) );
		$out = (string) ob_get_clean();
		$this->assertStringContainsString( 'application/ld+json', $out );
		$this->assertDoesNotMatchRegularExpression( '/rating|review/i', $out );
		remove_filter( 'ideatoapps_app_schema', $dirty, 11 );
		$saved = clone $GLOBALS['wp_filter']['ideatoapps_app_schema']; // remove_all_filters empties the hook object in place.
		remove_all_filters( 'ideatoapps_app_schema' );
		try {
			ob_start();
			ideatoapps_part( 'app-schema', array( 'app' => get_post( $id ) ) );
			$this->assertSame( '', ob_get_clean(), 'with nothing hooked (plugin filter removed) the seam prints nothing' );
		} finally {
			$GLOBALS['wp_filter']['ideatoapps_app_schema'] = $saved; // the plugin's filter must survive for the other tests.
		}
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
