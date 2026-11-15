<?php
require_once __DIR__ . '/CommerceTestCase.php';

final class CommerceFilesTest extends CommerceTestCase {
	private function render( string $file, array $vars = array() ): string {
		ob_start();
		include $file;
		return (string) ob_get_clean();
	}

	public function test_release_zip_is_moved_out_of_the_public_uploads_path_and_hidden(): void {
		$app = $this->app();
		$att  = $this->zip_attachment( 'my upload (3).zip' );
		ideatoapps_add_version( $app, '1.0.0', 'x', $att );
		$path = get_attached_file( $att );
		$root = realpath( wp_upload_dir()['basedir'] ) . '/woocommerce_uploads/ideatoapps/';
		$this->assertStringStartsWith( $root, $path, 'moved into the protected folder' );
		$this->assertMatchesRegularExpression( '#/ideatoapps/[0-9a-f]{12}/ClipForge-1\.0\.0\.zip$#', $path, 'unguessable directory, and the buyer-facing name is Title-version.zip whatever the upload was called' );
		$this->assertFileExists( $path );
		$this->assertFileDoesNotExist( wp_upload_dir()['path'] . '/my-upload-3.zip', 'no public copy' );
		$this->assertStringContainsString( 'Require all denied', (string) file_get_contents( $root . '.htaccess' ) );
		$this->assertStringContainsStringIgnoringCase( 'Deny from all', (string) file_get_contents( dirname( $root ) . '/.htaccess' ) );
		$this->assertSame( 'private', get_post_status( $att ), 'the media library does not list it publicly' );
		$this->assertSame( 0, (int) get_post( $att )->post_parent );
		$again = ideatoapps_protect_attachment_file( $att );
		$this->assertSame( realpath( $path ), $again, 'idempotent: not moved twice' );
		$rest = rest_do_request( new WP_REST_Request( 'GET', '/wp/v2/media/' . $att ) );
		$this->assertGreaterThanOrEqual( 401, $rest->get_status(), 'anonymous REST cannot see the zip attachment' );
	}

	public function test_public_app_page_never_exposes_the_zip(): void {
		$app = $this->app();
		$this->add_version( $app, '1.0.0', 'First.' );
		// Parts, not single-app.php: get_header() uses require_once, so a second full-page render in one process has no header.
		$post = get_post( $app );
		ob_start();
		foreach ( array( 'app-hero', 'app-details', 'app-faq', 'app-whats-new', 'app-buy' ) as $part ) {
			ideatoapps_part( $part, array( 'app' => $post ) );
		}
		$html = (string) ob_get_clean();
		$this->assertStringContainsString( 'Version 1.0.0', $html );
		foreach ( array( '.zip', 'woocommerce_uploads', 'wp-content/uploads', 'download_file=' ) as $needle ) {
			$this->assertStringNotContainsStringIgnoringCase( $needle, $html, $needle );
		}
	}

	public function test_seed_product_is_virtual_downloadable_2499_usd_unlimited_and_rerun_keeps_a_changed_price(): void {
		$app     = $this->app();
		$product = wc_get_product( (int) get_post_meta( $app, 'woo_product_id', true ) );
		$this->assertTrue( $product->is_virtual() && $product->is_downloadable() && $product->is_sold_individually() );
		$this->assertSame( '24.99', $product->get_regular_price() );
		$this->assertSame( -1, (int) $product->get_download_limit() );
		$this->assertSame( -1, (int) $product->get_download_expiry() );
		$this->assertSame( 'USD', get_woocommerce_currency() );
		$product->set_regular_price( '19.00' );
		$product->set_downloadable( false );
		$product->set_download_limit( 3 );
		$product->save();
		$this->assertSame( $app, ideatoapps_seed_clipforge() );
		$fixed = wc_get_product( $product->get_id() );
		$this->assertTrue( $fixed->is_downloadable() );
		$this->assertSame( -1, (int) $fixed->get_download_limit() );
		$this->assertSame( '19.00', $fixed->get_regular_price(), 'the owner price is never reset by the seed' );
		$this->assertCount( 1, get_posts( array( 'post_type' => 'product', 'post_status' => 'any', 'numberposts' => -1 ) ) );
	}

	public function test_live_stripe_is_hidden_unless_live_payments_are_allowed(): void {
		$gateways = array( 'stripe' => new stdClass(), 'stripe_sepa' => new stdClass(), 'cod' => new stdClass() );
		update_option( 'woocommerce_stripe_settings', array( 'enabled' => 'yes', 'testmode' => 'yes' ) );
		$this->assertSame( array_keys( $gateways ), array_keys( ideatoapps_block_live_stripe( $gateways ) ), 'test mode stays available' );
		update_option( 'woocommerce_stripe_settings', array( 'enabled' => 'yes', 'testmode' => 'no' ) );
		$this->assertSame( array( 'cod' ), array_keys( apply_filters( 'woocommerce_available_payment_gateways', $gateways ) ), 'live Stripe is removed by the real filter' );
		$this->assertTrue( has_action( 'admin_notices', 'ideatoapps_live_stripe_notice' ) !== false );
		wp_set_current_user( $this->make_user( 'administrator' ) );
		ob_start();
		ideatoapps_live_stripe_notice();
		$this->assertStringContainsString( 'test-mode only', (string) ob_get_clean() );
	}

	public function test_checkout_and_cart_pages_are_classic_shortcodes(): void {
		delete_option( 'ideatoapps_classic_pages' );
		ideatoapps_use_classic_commerce_pages();
		$this->assertSame( '[woocommerce_checkout]', get_post_field( 'post_content', wc_get_page_id( 'checkout' ) ) );
		$this->assertSame( '[woocommerce_cart]', get_post_field( 'post_content', wc_get_page_id( 'cart' ) ) );
		wp_update_post( array( 'ID' => wc_get_page_id( 'cart' ), 'post_content' => 'Owner text' ) );
		ideatoapps_use_classic_commerce_pages();
		$this->assertSame( 'Owner text', get_post_field( 'post_content', wc_get_page_id( 'cart' ) ), 'later owner edits are kept' );
	}

	public function test_library_lists_each_version_with_changelog_and_a_signed_download_link(): void {
		$app = $this->app();
		$this->add_version( $app, '1.0.0', 'First release.' );
		$this->add_version( $app, '1.1.0', "Fixes.\nPolish." );
		$user = $this->customer();
		$this->order( $app, $user, 'completed' );
		wp_set_current_user( $user );
		WC()->customer = new WC_Customer( $user, true );
		$html = $this->render( get_theme_file_path( 'woocommerce/myaccount/downloads.php' ) );
		$this->assertStringContainsString( 'data-testid="library"', $html );
		$this->assertStringNotContainsString( 'No purchases yet', $html );
		$this->assertSame( 2, substr_count( $html, 'data-testid="library-version"' ) );
		$this->assertLessThan( strpos( $html, 'Version 1.0.0' ), strpos( $html, 'Version 1.1.0' ), 'newest first' );
		foreach ( array( 'Fixes.', 'Polish.', 'First release.', 'Download 1.1.0', 'Download 1.0.0' ) as $text ) {
			$this->assertStringContainsString( $text, $html );
		}
		preg_match_all( '#data-testid="download-button"#', $html, $m );
		$this->assertCount( 2, $m[0] );
		$this->assertMatchesRegularExpression( '#href="[^"]*download_file=\d+&(?:amp;|\#038;)?order=wc_order_\w+#', $html );
		$this->assertStringNotContainsString( 'woocommerce_uploads', $html, 'the real file address is never printed' );
	}

	public function test_library_empty_state_says_no_purchases_yet(): void {
		$user = $this->customer();
		wp_set_current_user( $user );
		WC()->customer = new WC_Customer( $user, true );
		$html = $this->render( get_theme_file_path( 'woocommerce/myaccount/downloads.php' ) );
		$this->assertStringContainsString( 'No purchases yet', $html );
		$this->assertStringContainsString( 'data-testid="library-empty"', $html );
		$this->assertStringNotContainsString( 'library-version', $html );
	}

	public function test_privacy_and_terms_copy_matches_what_accounts_do(): void {
		$privacy = $this->render( get_theme_file_path( 'parts/legal-privacy.php' ) );
		$terms   = $this->render( get_theme_file_path( 'parts/legal-terms.php' ) );
		$this->assertStringContainsString( 'you create an account', $privacy );
		$this->assertStringContainsString( 'hashed', $privacy );
		$this->assertStringContainsString( 'IP address', $privacy );
		$this->assertStringContainsString( 'not stored on this site', $privacy );
		$this->assertStringContainsString( 'signed in to the account that bought it', $terms );
	}
}
