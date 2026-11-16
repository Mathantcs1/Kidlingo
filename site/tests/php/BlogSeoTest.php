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
}
