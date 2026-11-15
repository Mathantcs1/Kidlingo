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
		$this->assertSame( 'Desktop browser (Chrome or Edge); Windows, macOS or Linux with Python 3 or Node.js to run the local launcher', get_post_meta( $id, 'platforms', true ) );
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
		$this->assertStringContainsString( 'Safari is untested', $post->post_content );

		$product = wc_get_product( (int) get_post_meta( $id, 'woo_product_id', true ) );
		$this->assertInstanceOf( WC_Product_Simple::class, $product );
		$this->assertSame( 'ClipForge', $product->get_name() );
		$this->assertSame( '24.99', $product->get_regular_price() );
		$this->assertTrue( $product->is_virtual() );
		$this->assertTrue( $product->is_downloadable() );
		$this->assertSame( array(), $product->get_downloads() );
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
		$this->assertStringContainsString( 'Safari is untested', $text );
		foreach ( array( 'Free to try', 'audio editing', 'effects', 'animation', 'rating', 'testimonial', 'customers' ) as $banned ) {
			$this->assertStringNotContainsStringIgnoringCase( $banned, $text, $banned );
		}
		$this->assertDoesNotMatchRegularExpression( '/\breviews?\b|\bstars?\b|\busers?\b/i', $text ); // "preview" is a feature word, not a review claim
		$this->assertStringNotContainsString( 'What&#039;s new', $html );
		$this->assertStringNotContainsString( 'data-testid="app-whats-new"', $html );
	}

	public function test_without_woocommerce_the_app_is_created_without_a_product_link(): void {
		add_filter( 'ideatoapps_woocommerce_active', '__return_false' );
		$id = ideatoapps_seed_clipforge();
		remove_filter( 'ideatoapps_woocommerce_active', '__return_false' );
		$this->assertSame( 0, (int) get_post_meta( $id, 'woo_product_id', true ) );
	}
}
