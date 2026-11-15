<?php
final class BrandTest extends WPTestCase {
	public function test_default_og_image_is_an_absolute_url_to_an_existing_1200x630_file(): void {
		$url = ideatoapps_default_og_image();
		$this->assertMatchesRegularExpression( '#^https?://#', $url );
		$this->assertStringEndsWith( '/assets/img/og-default.png', $url );
		$path = get_theme_file_path( 'assets/img/og-default.png' );
		$this->assertFileExists( $path );
		$this->assertSame( array( 1200, 630 ), array_slice( getimagesize( $path ), 0, 2 ) );
	}

	public function test_head_outputs_favicons_theme_color_and_og_image_once(): void {
		ob_start();
		do_action( 'wp_head' );
		$head = (string) ob_get_clean();
		$this->assertStringContainsString( 'rel="icon"', $head );
		$this->assertStringContainsString( 'rel="apple-touch-icon"', $head );
		$this->assertStringContainsString( 'name="theme-color"', $head );
		$this->assertSame( 1, substr_count( $head, 'property="og:image"' ) );
		$this->assertSame( 1, substr_count( $head, 'name="twitter:image"' ) );
	}

	public function test_og_image_is_skipped_when_another_source_already_outputs_one(): void {
		add_filter( 'ideatoapps_has_og_image', '__return_true' );
		ob_start();
		do_action( 'wp_head' );
		$head = (string) ob_get_clean();
		remove_filter( 'ideatoapps_has_og_image', '__return_true' );
		$this->assertStringNotContainsString( 'og:image', $head );
		$this->assertStringContainsString( 'rel="apple-touch-icon"', $head );
	}
}
