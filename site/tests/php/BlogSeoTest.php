<?php
require_once __DIR__ . '/SeoTestCase.php';

/**
 * Blog index SEO: a search view is noindex,follow with no canonical (as every noindex page here); a category view stays indexable
 * with its own canonical; unknown filters are ignored; paging is kept.
 */
final class BlogSeoTest extends SeoTestCase {
	private function robots( string $head ): string {
		return (string) $this->meta( $head, 'name', 'robots' );
	}

	private function canonicals( string $head ): array {
		preg_match_all( '/<link rel=["\']canonical["\'] href=["\']([^"\']+)["\']/', $head, $m );
		return $m[1];
	}

	private function blog_with_posts(): void {
		$this->make_page( 'blog', 'Blog' );
		$cat = (int) wp_insert_term( 'Prompting', 'category', array( 'slug' => 'prompting' ) )['term_id'];
		wp_insert_post( array( 'post_title' => 'A prompt', 'post_status' => 'publish', 'post_category' => array( $cat ) ) );
		wp_insert_post( array( 'post_title' => 'Plain', 'post_status' => 'publish' ) );
	}

	public function test_plain_blog_is_indexable_with_its_canonical(): void {
		$this->blog_with_posts();
		$this->go_to( home_url( '/blog/' ) );
		$head = $this->head();
		$this->assertStringNotContainsString( 'noindex', $this->robots( $head ) );
		$this->assertSame( array( 'https://ideatoapps.net/blog/' ), $this->canonicals( $head ) );
	}

	public function test_search_views_are_noindex_follow_without_a_canonical(): void {
		$this->blog_with_posts();
		foreach ( array( '/blog/?q=prompt', '/blog/?q=prompt&cat=prompting', '/blog/?q=%3Cb%3Ex%3C%2Fb%3E&pg=2', '/blog/?q=' . str_repeat( 'a', 500 ) ) as $path ) {
			$this->go_to( home_url( $path ) );
			$head = $this->head();
			$this->assertStringContainsString( 'noindex', $this->robots( $head ), $path );
			$this->assertStringContainsString( 'follow', $this->robots( $head ), $path );
			$this->assertSame( array(), $this->canonicals( $head ), $path );
		}
	}

	public function test_a_search_that_cleans_to_nothing_or_is_an_array_is_the_plain_blog(): void {
		$this->blog_with_posts();
		foreach ( array( '/blog/?q=', '/blog/?q=%3Cscript%3E', '/blog/?q[]=x', '/blog/?cat[]=y' ) as $path ) {
			$this->go_to( home_url( $path ) );
			$head = $this->head();
			$this->assertStringNotContainsString( 'noindex', $this->robots( $head ), $path );
			$this->assertSame( array( 'https://ideatoapps.net/blog/' ), $this->canonicals( $head ), $path );
		}
	}

	public function test_category_view_is_indexable_with_its_own_canonical_and_unknown_category_is_ignored(): void {
		$this->blog_with_posts();
		$this->go_to( home_url( '/blog/?cat=prompting&utm=1' ) );
		$head = $this->head();
		$this->assertStringNotContainsString( 'noindex', $this->robots( $head ) );
		$this->assertSame( array( 'https://ideatoapps.net/blog/?cat=prompting' ), $this->canonicals( $head ) );
		$this->assertSame( 'https://ideatoapps.net/blog/?cat=prompting', $this->meta( $head, 'property', 'og:url' ) );
		$this->go_to( home_url( '/blog/?cat=no-such' ) );
		$head = $this->head();
		$this->assertStringNotContainsString( 'noindex', $this->robots( $head ) );
		$this->assertSame( array( 'https://ideatoapps.net/blog/' ), $this->canonicals( $head ) );
	}

	public function test_canonical_uses_the_same_page_number_the_page_renders(): void {
		$this->blog_with_posts();
		foreach ( array( '2abc', '%202', '2.5', '9999999999', '-3', '0', 'x', '' ) as $pg ) {
			$this->go_to( home_url( '/blog/?pg=' . $pg ) );
			$head = $this->head();
			$this->assertSame( array( 'https://ideatoapps.net/blog/' ), $this->canonicals( $head ), "pg=$pg renders page 1, so that is the canonical" );
			$this->assertStringNotContainsString( 'Page ', $this->title(), "pg=$pg" );
			$this->assertDoesNotMatchRegularExpression( '/Page \d/', (string) $this->meta( $head, 'name', 'description' ), "pg=$pg" );
		}
		$this->go_to( home_url( '/blog/?pg[]=2' ) );
		$this->assertSame( array( 'https://ideatoapps.net/blog/' ), $this->canonicals( $this->head() ) );
	}

	public function test_real_pages_keep_pg_with_and_without_a_category(): void {
		$this->blog_with_posts();
		$cat = get_term_by( 'slug', 'prompting', 'category' )->term_id;
		for ( $i = 0; $i < 13; $i++ ) {
			wp_insert_post( array( 'post_title' => "P$i", 'post_status' => 'publish', 'post_category' => array( $cat ) ) );
		}
		$this->go_to( home_url( '/blog/?cat=prompting&pg=2&utm=1' ) );
		$head = $this->head();
		$this->assertSame( array( 'https://ideatoapps.net/blog/?cat=prompting&pg=2' ), array_map( 'html_entity_decode', $this->canonicals( $head ) ) );
		$this->assertStringContainsString( 'Page 2', $this->title() );
		$this->go_to( home_url( '/blog/?pg=2' ) );
		$this->assertSame( array( 'https://ideatoapps.net/blog/?pg=2' ), $this->canonicals( $this->head() ) );
	}

	public function test_a_page_past_the_end_canonicalises_to_the_page_the_redirect_lands_on(): void {
		$this->blog_with_posts(); // two posts: one page. pg=99 is redirected to page 1 before any head is printed; if a head were printed it names page 1.
		$page = ideatoapps_blog_request( array( 'pg' => '99' ) )['pg'];
		$this->assertSame( 99, $page );
		$this->assertSame( 1, ideatoapps_overflow_target_page( 99, ideatoapps_list_page_count( ideatoapps_blog_query_args( array( 'pg' => '99' ) ) ) ) );
	}

	public function test_each_category_view_has_its_own_title_and_description_and_search_views_keep_the_default(): void {
		$this->blog_with_posts();
		$cat2 = (int) wp_insert_term( 'AI basics', 'category', array( 'slug' => 'ai-basics', 'description' => 'What AI is, in plain words.' ) )['term_id'];
		wp_insert_post( array( 'post_title' => 'Another', 'post_status' => 'publish', 'post_category' => array( $cat2 ) ) );
		$this->go_to( home_url( '/blog/?cat=prompting' ) );
		$head = $this->head();
		$this->assertSame( 'Prompting articles – ' . get_bloginfo( 'name' ), $this->title() );
		$this->assertSame( 'Articles about Prompting from IdeaToApps.', $this->meta( $head, 'name', 'description' ) );
		$this->assertSame( 'Prompting articles – ' . get_bloginfo( 'name' ), $this->meta( $head, 'property', 'og:title' ) );
		$this->assertSame( 'Articles about Prompting from IdeaToApps.', $this->meta( $head, 'property', 'og:description' ) );
		$this->go_to( home_url( '/blog/?cat=ai-basics' ) );
		$head = $this->head();
		$this->assertSame( 'AI basics articles – ' . get_bloginfo( 'name' ), $this->title() );
		$this->assertSame( 'What AI is, in plain words.', $this->meta( $head, 'name', 'description' ) );
		$this->go_to( home_url( '/blog/' ) );
		$this->assertSame( 'Blog – ' . get_bloginfo( 'name' ), $this->title() );
		$this->assertSame( 'Notes and news from IdeaToApps.', $this->meta( $this->head(), 'name', 'description' ) );
		$this->go_to( home_url( '/blog/?cat=nope' ) );
		$this->assertSame( 'Blog – ' . get_bloginfo( 'name' ), $this->title() );
	}
}
