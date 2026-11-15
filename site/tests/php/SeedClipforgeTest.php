<?php
final class SeedClipforgeTest extends WPTestCase {
	private function render_single( int $id ): string {
		global $wp_query;
		$wp_query = new WP_Query( array( 'p' => $id, 'post_type' => 'app' ) ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		ob_start();
		include get_theme_file_path( 'single-app.php' );
		return (string) ob_get_clean();
	}

	public function test_creates_the_app_and_a_linked_woo_product(): void {
		$id   = ideatoapps_seed_clipforge();
		$post = get_post( $id );
		$this->assertSame( 'app', $post->post_type );
		$this->assertSame( 'clipforge', $post->post_name );
		$this->assertSame( 'ClipForge', $post->post_title );
		$this->assertSame( 'publish', $post->post_status );
		$this->assertSame( 'Edit videos in your browser. Your files stay on your device.', get_post_meta( $id, 'tagline', true ) );
		$this->assertSame( 'Chromium-based desktop browser (Safari untested); Python 3 or Node.js to run the local launcher', get_post_meta( $id, 'platforms', true ) );
		$this->assertSame( '$24.99 one-time', get_post_meta( $id, 'price_label', true ) );
		$this->assertSame( 'live', get_post_meta( $id, 'delivery_status', true ) );
		$this->assertSame( array( 'Creator' ), wp_get_object_terms( $id, 'app_category', array( 'fields' => 'names' ) ) );
		$this->assertSame(
			array(
				'Import video, audio and images, including screen recordings without sound',
				'Arrange, trim and split clips on a timeline; ripple delete; snapping',
				'Stack video layers and audio tracks (up to 8 of each) with mute, solo, lock and hide',
				'Move, scale and rotate a clip on the preview for picture-in-picture',
				'YouTube 16:9, Vertical 9:16, Square 1:1 and Portrait 4:5 formats',
				'Undo/redo and autosave in your browser',
				'Export MP4 (H.264 + AAC) at 1080p or 4K',
				'Runs locally: your media is never uploaded',
			),
			ideatoapps_app_features( $id )
		);
		$this->assertSame( array( 'Do I need an internet connection?', 'Which browsers work?', 'How do I get updates?' ), array_column( ideatoapps_app_faq( $id ), 'q' ) );
		$this->assertStringContainsString( 'Safari untested', $post->post_content );

		$product = wc_get_product( (int) get_post_meta( $id, 'woo_product_id', true ) );
		$this->assertInstanceOf( WC_Product_Simple::class, $product );
		$this->assertSame( 'ClipForge', $product->get_name() );
		$this->assertSame( '24.99', $product->get_regular_price() );
		$this->assertTrue( $product->is_virtual() );
		$this->assertTrue( $product->is_downloadable() );
		$this->assertSame( array(), $product->get_downloads() );
	}

	public function test_copy_makes_no_claims_the_readme_does_not_back(): void {
		$id   = ideatoapps_seed_clipforge();
		$post = get_post( $id );
		$all  = $post->post_content . ' ' . get_post_meta( $id, 'platforms', true ) . ' ' . get_post_meta( $id, 'tagline', true ) . ' ' . get_post_meta( $id, 'faq', true ) . ' ' . get_post_meta( $id, 'features', true );
		$this->assertDoesNotMatchRegularExpression( '/\bEdge\b|Windows|macOS|Linux|account library/i', $all );
		$this->assertStringContainsString( 'Safari untested', $post->post_content );
	}

	public function test_rerun_restores_a_trashed_app_instead_of_duplicating_it(): void {
		$first = ideatoapps_seed_clipforge();
		wp_trash_post( $first );
		$second = ideatoapps_seed_clipforge();
		$this->assertSame( $first, $second );
		$this->assertSame( 'publish', get_post_status( $first ) );
		$this->assertSame( 'clipforge', get_post( $first )->post_name );
		$this->assertCount( 1, get_posts( array( 'post_type' => 'app', 'post_status' => array( 'any', 'trash' ), 'numberposts' => -1 ) ) );
	}

	public function test_rerun_links_a_product_when_woocommerce_was_inactive_the_first_time(): void {
		add_filter( 'ideatoapps_woocommerce_active', '__return_false' );
		$id = ideatoapps_seed_clipforge();
		remove_filter( 'ideatoapps_woocommerce_active', '__return_false' );
		$this->assertSame( 0, (int) get_post_meta( $id, 'woo_product_id', true ) );
		$this->assertSame( $id, ideatoapps_seed_clipforge() );
		$pid = (int) get_post_meta( $id, 'woo_product_id', true );
		$this->assertSame( 'product', get_post_type( $pid ) );
		$this->assertSame( $pid, (int) get_post_meta( $id, 'woo_product_id', true ) );
		ideatoapps_seed_clipforge();
		$this->assertCount( 1, get_posts( array( 'post_type' => 'product', 'post_status' => array( 'any', 'trash' ), 'numberposts' => -1 ) ) );
	}

	public function test_rerun_reuses_the_apps_existing_product_when_the_link_was_lost_and_repairs_a_trashed_one(): void {
		$id  = ideatoapps_seed_clipforge();
		$pid = (int) get_post_meta( $id, 'woo_product_id', true );
		delete_post_meta( $id, 'woo_product_id' );
		ideatoapps_seed_clipforge();
		$this->assertSame( $pid, (int) get_post_meta( $id, 'woo_product_id', true ) );
		wp_trash_post( $pid );
		ideatoapps_seed_clipforge();
		$this->assertSame( $pid, (int) get_post_meta( $id, 'woo_product_id', true ) );
		$this->assertSame( 'publish', get_post_status( $pid ) );
		$this->assertCount( 1, get_posts( array( 'post_type' => 'product', 'post_status' => array( 'any', 'trash' ), 'numberposts' => -1 ) ) );
	}

	private function product_count(): int {
		return count( get_posts( array( 'post_type' => 'product', 'post_status' => array( 'any', 'trash' ), 'numberposts' => -1, 'fields' => 'ids' ) ) );
	}

	public function test_rerun_restores_the_linked_product_when_it_is_trashed_even_without_a_tag(): void {
		$id  = ideatoapps_seed_clipforge();
		$pid = (int) get_post_meta( $id, 'woo_product_id', true );
		delete_post_meta( $pid, '_ideatoapps_app_id' );
		wp_trash_post( $pid );
		$this->assertSame( $id, ideatoapps_seed_clipforge() );
		$this->assertSame( $pid, (int) get_post_meta( $id, 'woo_product_id', true ) );
		$this->assertSame( 'publish', get_post_status( $pid ) );
		$this->assertSame( 1, $this->product_count() );
	}

	public function test_rerun_reuses_and_tags_a_legacy_untagged_product_when_the_link_is_lost(): void {
		$id  = ideatoapps_seed_clipforge();
		$pid = (int) get_post_meta( $id, 'woo_product_id', true );
		delete_post_meta( $pid, '_ideatoapps_app_id' );
		delete_post_meta( $id, 'woo_product_id' );
		ideatoapps_seed_clipforge();
		$this->assertSame( $pid, (int) get_post_meta( $id, 'woo_product_id', true ) );
		$this->assertSame( $id, (int) get_post_meta( $pid, '_ideatoapps_app_id', true ) );
		$this->assertSame( 1, $this->product_count() );
	}

	public function test_adds_no_versions_or_files(): void {
		$id = ideatoapps_seed_clipforge();
		$this->assertSame( array(), ideatoapps_get_versions( $id ) );
	}

	public function test_is_idempotent(): void {
		$first  = ideatoapps_seed_clipforge();
		$second = ideatoapps_seed_clipforge();
		$this->assertSame( $first, $second );
		$this->assertCount( 1, get_posts( array( 'post_type' => 'app', 'name' => 'clipforge', 'post_status' => 'any', 'numberposts' => -1 ) ) );
		$this->assertCount( 1, get_posts( array( 'post_type' => 'product', 'title' => 'ClipForge', 'post_status' => 'any', 'numberposts' => -1 ) ) );
	}

	public function test_the_seeded_page_renders_without_download_leaks_or_unbacked_claims(): void {
		$id   = ideatoapps_seed_clipforge();
		$html = $this->render_single( $id );
		$this->assertStringContainsString( 'Buy ClipForge, $24.99 one-time', $html );
		$this->assertStringContainsString( 'add-to-cart=' . (int) get_post_meta( $id, 'woo_product_id', true ), $html );
		$this->assertStringNotContainsString( '.zip', $html );
		$this->assertStringNotContainsString( 'wp-content/uploads', $html );
		preg_match( '#<main.*?</main>#s', $html, $main );
		$text = wp_strip_all_tags( $main[0] ?? '' );
		$this->assertStringContainsString( 'Safari untested', $text );
		foreach ( array( 'Free to try', 'audio editing', 'effects', 'animation', 'rating', 'testimonial', 'customers' ) as $banned ) {
			$this->assertStringNotContainsStringIgnoringCase( $banned, $text, $banned );
		}
		$this->assertDoesNotMatchRegularExpression( '/\breviews?\b|\bstars?\b|\busers?\b/i', $text ); // "preview" is a feature word, not a review claim
		$this->assertStringNotContainsString( 'data-testid="app-whats-new"', $html );
	}

	public function test_without_woocommerce_the_app_is_created_without_a_product_link(): void {
		add_filter( 'ideatoapps_woocommerce_active', '__return_false' );
		$id = ideatoapps_seed_clipforge();
		remove_filter( 'ideatoapps_woocommerce_active', '__return_false' );
		$this->assertSame( 0, (int) get_post_meta( $id, 'woo_product_id', true ) );
	}
}
