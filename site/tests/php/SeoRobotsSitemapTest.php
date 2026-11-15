<?php
require_once __DIR__ . '/SeoTestCase.php';

final class SeoRobotsSitemapTest extends SeoTestCase {
	private function robots_txt(): string {
		ob_start();
		do_robots();
		return (string) ob_get_clean();
	}

	private function sitemap_urls( string $type, string $subtype ): array {
		$provider = wp_sitemaps_get_server()->registry->get_provider( $type );
		$this->assertNotNull( $provider, $type );
		$list = $provider->get_url_list( 1, $subtype );
		return array_column( $list, 'loc' );
	}

	public function test_robots_txt_references_the_apex_sitemap_and_disallows_private_areas(): void {
		$txt = $this->robots_txt();
		$this->assertStringContainsString( "Sitemap: https://ideatoapps.net/sitemap.xml\n", $txt . "\n" );
		foreach ( array( '/wp-admin/', '/my-account/', '/cart/', '/checkout/' ) as $path ) {
			$this->assertMatchesRegularExpression( '#^Disallow: ' . preg_quote( $path, '#' ) . '$#m', $txt, $path );
		}
		$this->assertMatchesRegularExpression( '#^Allow: /wp-admin/admin-ajax\.php$#m', $txt );
		$this->assertSame( 1, substr_count( $txt, 'Sitemap:' ), 'exactly one sitemap line' );
		$this->assertDoesNotMatchRegularExpression( '#^Disallow: /\s*$#m', $txt, 'the site is not blocked' );
	}

	public function test_robots_txt_is_left_alone_when_search_engines_are_discouraged(): void {
		update_option( 'blog_public', '0' );
		$this->assertStringContainsString( 'Disallow: /', $this->robots_txt() );
		$this->assertStringNotContainsString( 'ideatoapps.net/sitemap.xml', $this->robots_txt() );
	}

	public function test_sitemap_xml_is_rewritten_to_the_core_sitemap(): void {
		$rules = get_option( 'rewrite_rules' );
		$this->assertIsArray( $rules );
		$this->assertSame( 'index.php?sitemap=index', $rules['^sitemap\.xml$'] ?? null );
		$this->assertArrayHasKey( '^wp-sitemap\.xml$', $rules );
	}

	public function test_sitemap_lists_clipforge_and_drops_noindex_and_empty_content(): void {
		$cf    = $this->app();
		$draft = $this->make_app( 'Draft App', 'draft' );
		$soon  = $this->make_app( 'Soon App', 'coming_soon' );
		$cart  = $this->woo_page( 'cart', 'cart' );
		$acct  = $this->woo_page( 'myaccount', 'my-account' );
		$this->make_page( 'about', 'About' );
		$urls = $this->sitemap_urls( 'posts', 'app' );
		$this->assertContains( home_url( '/apps/clipforge/' ), $urls );
		$this->assertContains( home_url( '/apps/soon-app/' ), $urls );
		$this->assertNotContains( home_url( '/apps/draft-app/' ), $urls );
		$this->assertContains( home_url( '/apps/' ), $urls, 'the apps archive is listed while there are apps' );
		$pages = $this->sitemap_urls( 'posts', 'page' );
		$this->assertContains( home_url( '/about/' ), $pages );
		foreach ( array( 'cart', 'my-account' ) as $slug ) {
			$this->assertNotContains( home_url( "/$slug/" ), $pages, $slug );
		}
		$this->assertGreaterThan( 0, $cf + $draft + $soon + $cart + $acct );
	}

	public function test_sitemap_has_no_products_taxonomies_users_or_empty_modules(): void {
		$this->make_app( 'Alone', 'live' );
		ideatoapps_seed_clipforge_product( $this->make_app( 'P', 'live' ) );
		$registry = wp_sitemaps_get_server()->registry;
		$this->assertNull( $registry->get_provider( 'users' ) );
		$this->assertSame( array(), wp_sitemaps_get_server()->registry->get_provider( 'taxonomies' )->get_object_subtypes() );
		$types = array_keys( $registry->get_provider( 'posts' )->get_object_subtypes() );
		$this->assertNotContains( 'product', $types );
		$this->assertContains( 'app', $types );
		$this->assertSame( 0, wp_sitemaps_get_server()->registry->get_provider( 'posts' )->get_max_num_pages( 'video' ), 'no videos, no learn sitemap' );
		$this->assertSame( 0, wp_sitemaps_get_server()->registry->get_provider( 'posts' )->get_max_num_pages( 'post' ), 'no posts, no blog sitemap' );
	}

	public function test_blog_page_is_only_listed_when_there_are_posts(): void {
		$this->make_page( 'blog', 'Blog' );
		$this->assertNotContains( home_url( '/blog/' ), $this->sitemap_urls( 'posts', 'page' ) );
		wp_insert_post( array( 'post_title' => 'First', 'post_status' => 'publish' ) );
		$this->assertContains( home_url( '/blog/' ), $this->sitemap_urls( 'posts', 'page' ) );
	}
}
