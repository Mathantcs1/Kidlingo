<?php
require_once __DIR__ . '/WPTestCase.php';

/** Blog index markup: filters, summary escaping, empty states, featured card and the post page category link. */
final class BlogIndexPartsTest extends WPTestCase {
	protected function setUp(): void {
		parent::setUp();
		wp_delete_post( 1, true );
	}

	private function render( string $part, array $args = array() ): string {
		ob_start();
		ideatoapps_part( $part, $args );
		return (string) ob_get_clean();
	}

	private function cat( string $name, string $slug ): int {
		return (int) wp_insert_term( $name, 'category', array( 'slug' => $slug ) )['term_id'];
	}

	private function post( string $title, array $cats = array() ): WP_Post {
		return get_post( (int) wp_insert_post( array( 'post_status' => 'publish', 'post_title' => $title, 'post_content' => 'Body', 'post_category' => $cats ) ) );
	}

	public function test_filters_have_all_first_current_chip_search_form_and_keep_q_in_chip_links(): void {
		$this->post( 'A', array( $this->cat( 'AI basics', 'ai-basics' ) ) );
		$this->post( 'B', array( $this->cat( 'Prompting', 'prompting' ) ) );
		$req  = array( 'cat' => 'prompting', 'q' => 'a & b', 'pg' => 1 );
		$html = $this->render( 'blog-filters', array( 'req' => $req, 'categories' => ideatoapps_blog_categories(), 'found' => 1 ) );
		$this->assertStringContainsString( 'role="search"', $html );
		$this->assertStringContainsString( 'Search articles', $html );
		$this->assertMatchesRegularExpression( '/<input class="field" type="search" id="blog-search-q" name="q" value="a &amp; b" maxlength="80"/', $html );
		$this->assertStringContainsString( '<input type="hidden" name="cat" value="prompting">', $html );
		preg_match_all( '#<a class="blog-chip" href="([^"]+)"( aria-current="true")?>#', $html, $m, PREG_SET_ORDER );
		$this->assertCount( 3, $m );
		$this->assertStringContainsString( 'q=a%20%26%20b', $m[1][1], 'chips keep the search' );
		$this->assertSame( array( '', '', ' aria-current="true"' ), array_map( static fn( $x ) => $x[2] ?? '', $m ) );
		$this->assertMatchesRegularExpression( '#<a class="blog-chip"[^>]*>All</a>#', $html );
		$this->assertLessThan( strpos( $html, 'AI basics' ), strpos( $html, '>All<' ) );
	}

	public function test_summary_counts_and_escapes_the_query(): void {
		$one = $this->render( 'blog-filters', array( 'req' => array( 'cat' => '', 'q' => '', 'pg' => 1 ), 'found' => 7 ) );
		$this->assertStringContainsString( '7 articles', $one );
		$this->assertStringContainsString( '1 article', $this->render( 'blog-filters', array( 'req' => array( 'cat' => '', 'q' => '', 'pg' => 1 ), 'found' => 1 ) ) );
		$q    = $this->render( 'blog-filters', array( 'req' => array( 'cat' => '', 'q' => 'x&lt;script&gt; "y"', 'pg' => 1 ), 'found' => 3 ) );
		$this->assertStringContainsString( '3 articles for &quot;x&amp;lt;script&amp;gt; &quot;y&quot;&quot;', $q );
		$this->assertStringNotContainsString( '<script', $q );
	}

	public function test_no_results_state_has_a_clear_filters_link_and_its_own_testid(): void {
		$html = $this->render( 'blog-no-results' );
		$this->assertStringContainsString( 'data-testid="blog-no-results"', $html );
		$this->assertStringNotContainsString( 'blog-empty', $html );
		$this->assertMatchesRegularExpression( '#<a class="btn btn--secondary" href="[^"]+">Clear filters</a>#', $html );
		$this->assertStringContainsString( 'data-testid="blog-empty"', $this->render( 'post-list', array( 'posts' => array() ) ) );
	}

	public function test_cards_show_category_reading_time_and_the_featured_card_is_separate(): void {
		$cat   = $this->cat( 'Prompting', 'prompting' );
		$first = $this->post( 'Newest', array( $cat ) );
		$other = $this->post( 'Older' );
		$html  = $this->render( 'post-list', array( 'posts' => array( $other ), 'featured' => $first ) );
		$this->assertStringContainsString( 'data-testid="blog-featured"', $html );
		$this->assertSame( 2, substr_count( $html, '<article' ) );
		$this->assertSame( 1, substr_count( $html, 'data-testid="card-label"' ), 'Uncategorized shows no label' );
		$this->assertSame( 2, substr_count( $html, '1 min read' ) );
		$this->assertStringContainsString( 'card card--featured', $html );
		$this->assertSame( 1, substr_count( $html, 'Newest</a>' ) );
		$this->assertStringNotContainsString( '<h3', $html );
	}

	public function test_the_post_page_category_chip_links_to_that_category(): void {
		$post = $this->post( 'P', array( $this->cat( 'AI basics', 'ai-basics' ) ) );
		$html = $this->render( 'post-chip', array( 'post_id' => $post->ID ) );
		$this->assertMatchesRegularExpression( '#data-testid="post-category"><a href="[^"]*cat=ai-basics">AI basics</a></p>#', $html );
		$this->assertSame( '', trim( $this->render( 'post-chip', array( 'post_id' => $this->post( 'Plain' )->ID ) ) ), 'Uncategorized has no chip' );
	}
}
