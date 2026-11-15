<?php
require_once __DIR__ . '/SeoTestCase.php';

final class SeoHeadTest extends SeoTestCase {
	private function robots( string $head ): string {
		return (string) $this->meta( $head, 'name', 'robots' );
	}

	private function canonicals( string $head ): array {
		preg_match_all( '/<link rel=["\']canonical["\'] href=["\']([^"\']+)["\']/', $head, $m );
		return $m[1];
	}

	public function test_canonical_is_on_the_constant_origin_once_and_ignores_the_request_host(): void {
		$app = $this->make_app( 'Canon App', 'coming_soon', array( 'tagline' => 'A tagline.' ) );
		$_SERVER['HTTP_HOST'] = 'evil.example';
		$this->go_to( home_url( '/apps/canon-app/?utm_source=x&ref=y' ) );
		$head = $this->head();
		unset( $_SERVER['HTTP_HOST'] );
		$this->assertSame( array( 'https://ideatoapps.net/apps/canon-app/' ), $this->canonicals( $head ), 'one canonical, no query string' );
		$this->assertSame( 'https://ideatoapps.net/apps/canon-app/', $this->meta( $head, 'property', 'og:url' ) );
		$this->assertStringNotContainsString( 'rel="canonical" href="http://', $head );
		$this->assertGreaterThan( 0, $app );
	}

	public function test_home_canonical_and_other_templates(): void {
		$this->go_to( home_url( '/' ) );
		$this->assertSame( array( 'https://ideatoapps.net/' ), $this->canonicals( $this->head() ) );
		$this->make_app( 'Listed', 'live' );
		$this->go_to( home_url( '/apps/' ) );
		$this->assertSame( array( 'https://ideatoapps.net/apps/' ), $this->canonicals( $this->head() ) );
	}

	public function test_blog_paging_is_the_only_query_string_kept(): void {
		$this->make_page( 'blog', 'Blog' );
		wp_insert_post( array( 'post_title' => 'A post', 'post_status' => 'publish' ) );
		$this->go_to( home_url( '/blog/?pg=2&utm=1' ) );
		$this->assertSame( array( 'https://ideatoapps.net/blog/?pg=2' ), $this->canonicals( $this->head() ) );
		$this->go_to( home_url( '/blog/?pg=1' ) );
		$this->assertSame( array( 'https://ideatoapps.net/blog/' ), $this->canonicals( $this->head() ) );
	}

	public function test_origin_constant_and_the_local_test_filter(): void {
		$this->assertSame( 'https://ideatoapps.net', IDEATOAPPS_CANONICAL_ORIGIN );
		$this->assertSame( 'https://ideatoapps.net', ideatoapps_canonical_origin() );
		$use = static fn(): string => 'http://localhost:8888/';
		add_filter( 'ideatoapps_canonical_origin_local_testing_only', $use );
		$this->assertSame( 'http://localhost:8888', ideatoapps_canonical_origin() );
		remove_filter( 'ideatoapps_canonical_origin_local_testing_only', $use );
	}

	public function test_noindex_pages_get_noindex_follow_and_no_canonical(): void {
		$cart     = $this->woo_page( 'cart', 'cart' );
		$checkout = $this->woo_page( 'checkout', 'checkout' );
		$account  = $this->woo_page( 'myaccount', 'my-account' );
		$shop     = $this->woo_page( 'shop', 'shop' );
		$this->assertGreaterThan( 0, $cart + $checkout + $account + $shop );
		$product = ideatoapps_seed_clipforge_product( $this->make_app( 'PA', 'live' ) );
		$cases   = array(
			'cart'      => '/cart/',
			'checkout'  => '/checkout/',
			'account'   => '/my-account/',
			'shop'      => '/shop/',
			'product'   => '/?p=' . $product,
			'search'    => '/?s=clip',
			'404'       => '/no-such-page-here/',
			'category'  => '/?category_name=uncategorized',
			'author'    => '/?author=1',
		);
		foreach ( $cases as $name => $path ) {
			$this->go_to( home_url( $path ) );
			$head = $this->head();
			$this->assertStringContainsString( 'noindex', $this->robots( $head ), $name );
			$this->assertStringContainsString( 'follow', $this->robots( $head ), $name );
			$this->assertSame( array(), $this->canonicals( $head ), "$name has no canonical" );
			$this->assertNull( $this->meta( $head, 'property', 'og:title' ), "$name has no og tags" );
		}
	}

	public function test_noindex_covers_thin_archives_and_empty_modules_but_not_real_pages(): void {
		$this->go_to( home_url( '/apps/' ) );
		$this->assertStringContainsString( 'noindex', $this->robots( $this->head() ), 'empty apps archive' );
		$this->go_to( home_url( '/learn/' ) );
		$this->assertStringContainsString( 'noindex', $this->robots( $this->head() ), 'empty learn archive' );
		$this->make_page( 'contact', 'Contact' );
		$this->go_to( home_url( '/contact/' ) );
		$this->assertStringContainsString( 'noindex', $this->robots( $this->head() ), 'contact form switched off' );
		update_option( 'ideatoapps_contact_enabled', true );
		$this->go_to( home_url( '/contact/' ) );
		$this->assertStringNotContainsString( 'noindex', $this->robots( $this->head() ) );

		$this->make_app( 'Real', 'live' );
		$this->go_to( home_url( '/apps/' ) );
		$this->assertStringNotContainsString( 'noindex', $this->robots( $this->head() ) );
		$this->go_to( home_url( '/' ) );
		$this->assertStringNotContainsString( 'noindex', $this->robots( $this->head() ) );
		$this->go_to( home_url( '/apps/?category=no-such-category' ) );
		$this->assertStringContainsString( 'noindex', $this->robots( $this->head() ), 'a filter with no results is a thin page' );
	}

	public function test_titles_and_descriptions_are_unique_per_template(): void {
		foreach ( array( 'about' => 'About', 'faq' => 'FAQ', 'privacy' => 'Privacy policy', 'terms' => 'Terms of service', 'refund-policy' => 'Refund policy' ) as $slug => $t ) {
			$this->make_page( $slug, $t );
		}
		$this->make_page( 'blog', 'Blog' );
		$this->make_page( 'contact', 'Contact' );
		update_option( 'ideatoapps_contact_enabled', true );
		$app    = $this->make_app( 'Alpha', 'live', array( 'tagline' => 'Alpha tagline.' ) );
		$other  = $this->make_app( 'Beta', 'coming_soon' );
		$post   = wp_insert_post( array( 'post_title' => 'Hello post', 'post_status' => 'publish', 'post_excerpt' => 'Post excerpt.' ) );
		$video  = wp_insert_post( array( 'post_type' => 'video', 'post_title' => 'Demo video', 'post_status' => 'publish', 'post_content' => 'Watch the demo.' ) );
		$paths  = array( '/', '/apps/', '/apps/alpha/', '/apps/beta/', '/learn/', '/learn/demo-video/', '/blog/', '/hello-post/', '/about/', '/faq/', '/contact/', '/privacy/', '/terms/', '/refund-policy/' );
		$titles = array();
		$descs  = array();
		foreach ( $paths as $path ) {
			$this->go_to( home_url( $path ) );
			$head  = $this->head();
			$title = $this->title();
			$desc  = $this->meta( $head, 'name', 'description' );
			$this->assertNotSame( '', $title, $path );
			$this->assertNotEmpty( $desc, "$path has a description" );
			$this->assertLessThanOrEqual( 170, mb_strlen( (string) $desc ), "$path description length" );
			$this->assertStringContainsString( 'IdeaToApps', $title, $path );
			$this->assertNotContains( $title, $titles, "$path title is unique" );
			$this->assertNotContains( $desc, $descs, "$path description is unique" );
			$titles[] = $title;
			$descs[]  = $desc;
			$this->assertSame( $title, html_entity_decode( (string) $this->meta( $head, 'property', 'og:title' ), ENT_QUOTES ), "$path og:title" );
			$this->assertSame( $desc, $this->meta( $head, 'property', 'og:description' ), $path );
			$this->assertSame( 'summary_large_image', $this->meta( $head, 'name', 'twitter:card' ), $path );
			$this->assertSame( 'IdeaToApps', $this->meta( $head, 'property', 'og:site_name' ), $path );
			$this->assertNotNull( $this->meta( $head, 'property', 'og:image' ), $path );
		}
		$this->assertContains( 'Learn – ' . get_bloginfo( 'name' ), $titles );
		$this->assertSame( 'Alpha tagline.', $this->descOf( '/apps/alpha/' ) );
		$this->assertGreaterThan( 0, $app + $other + $post + $video );
	}

	private function descOf( string $path ): string {
		$this->go_to( home_url( $path ) );
		return (string) $this->meta( $this->head(), 'name', 'description' );
	}

	public function test_og_image_is_the_featured_image_for_an_app_else_the_logo_card(): void {
		$app = $this->make_app( 'Pic', 'coming_soon' );
		$this->go_to( home_url( '/apps/pic/' ) );
		$this->assertSame( ideatoapps_default_og_image(), $this->meta( $this->head(), 'property', 'og:image' ) );
		$att = $this->zip_attachment( 'cover.png', base64_decode( 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' ) );
		wp_update_post( array( 'ID' => $att, 'post_mime_type' => 'image/png' ) );
		set_post_thumbnail( $app, $att );
		$this->go_to( home_url( '/apps/pic/' ) );
		$head = $this->head();
		$this->assertStringContainsString( 'cover', (string) $this->meta( $head, 'property', 'og:image' ) );
		$this->assertSame( 1, substr_count( $head, 'property="og:image"' ) );
		$this->assertSame( $this->meta( $head, 'property', 'og:image' ), $this->meta( $head, 'name', 'twitter:image' ) );
	}

	public function test_a_real_seo_plugin_takes_over_the_head_output(): void {
		add_filter( 'ideatoapps_seo_enabled', '__return_false' );
		$this->go_to( home_url( '/' ) );
		$head = $this->head();
		remove_filter( 'ideatoapps_seo_enabled', '__return_false' );
		$this->assertSame( array(), $this->canonicals( $head ) );
		$this->assertNull( $this->meta( $head, 'property', 'og:title' ) );
		$this->assertStringNotContainsString( 'application/ld+json', $head );
	}

	public function test_home_prints_organization_and_website_json_ld_once(): void {
		$this->go_to( home_url( '/' ) );
		$head = $this->head();
		$this->assertSame( 1, substr_count( $head, 'application/ld+json' ) );
		$this->assertStringContainsString( '"@type":"Organization"', $head );
		$this->go_to( home_url( '/apps/' ) );
		$this->assertStringNotContainsString( 'application/ld+json', $this->head() );
	}

	public function test_theme_color_is_a_per_scheme_pair(): void {
		$this->go_to( home_url( '/' ) );
		$head = $this->head();
		$this->assertMatchesRegularExpression( '/<meta name="theme-color" content="#0B1230" media="\(prefers-color-scheme: dark\)">/', $head );
		$this->assertMatchesRegularExpression( '/<meta name="theme-color" content="#F8FAFF" media="\(prefers-color-scheme: light\)">/', $head );
	}
}
