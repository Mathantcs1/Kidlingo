<?php
require_once __DIR__ . '/WPTestCase.php';

/**
 * Reader levels on the blog (theme): `?level=` whitelist and its combination with cat, q and paging; level chips; the level badge,
 * audience chips and "Who this is for" line on a post; the level on cards.
 */
final class BlogLevelTest extends WPTestCase {
	protected function setUp(): void {
		parent::setUp();
		wp_delete_post( 1, true );
	}

	private function render( string $part, array $args = array() ): string {
		ob_start();
		ideatoapps_part( $part, $args );
		return (string) ob_get_clean();
	}

	private function cat( string $slug ): int {
		$t = get_term_by( 'slug', $slug, 'category' );
		return $t ? (int) $t->term_id : (int) wp_insert_term( ucfirst( $slug ), 'category', array( 'slug' => $slug ) )['term_id'];
	}

	private function post( string $title, string $level = '', string $audiences = '', array $cats = array(), string $date = '2026-01-01 10:00:00' ): int {
		$id = (int) wp_insert_post( array( 'post_status' => 'publish', 'post_title' => $title, 'post_content' => 'Body of ' . $title, 'post_category' => $cats, 'post_date' => $date ) );
		if ( '' !== $level ) {
			update_post_meta( $id, 'ita_level', $level );
		}
		if ( '' !== $audiences ) {
			update_post_meta( $id, 'ita_audiences', $audiences );
		}
		return $id;
	}

	private function titles( array $get ): array {
		return wp_list_pluck( ( new WP_Query( ideatoapps_blog_query_args( $get ) ) )->posts, 'post_title' );
	}

	public function test_level_is_a_whitelist_and_odd_input_is_ignored(): void {
		foreach ( array( 'beginner', 'intermediate', 'advanced' ) as $ok ) {
			$this->assertSame( $ok, ideatoapps_blog_request( array( 'level' => $ok ) )['level'] );
		}
		foreach ( array( 'Beginner', 'BEGINNER', ' beginner', 'beginner ', 'expert', '', '<script>', 'beginner,advanced', str_repeat( 'a', 500 ), array( 'beginner' ), 5, null, true ) as $bad ) {
			$this->assertSame( '', ideatoapps_blog_request( array( 'level' => $bad ) )['level'], (string) wp_json_encode( $bad ) );
			$this->assertArrayNotHasKey( 'meta_query', ideatoapps_blog_query_args( array( 'level' => $bad ) ) );
		}
		$this->assertSame( '', ideatoapps_blog_request( array() )['level'] );
	}

	public function test_level_filters_and_combines_with_category_search_and_paging(): void {
		$p = $this->cat( 'prompting' );
		$a = $this->cat( 'agents' );
		$this->post( 'Tokens for beginners', 'beginner', 'beginners', array( $p ), '2026-01-03 10:00:00' );
		$this->post( 'Tokens for builders', 'advanced', 'builders', array( $p ), '2026-01-02 10:00:00' );
		$this->post( 'Agents for beginners', 'beginner', 'beginners', array( $a ), '2026-01-01 10:00:00' );
		$this->post( 'No level', '', '', array( $p ) );
		$this->assertSame( array( 'Tokens for beginners', 'Agents for beginners' ), $this->titles( array( 'level' => 'beginner' ) ) );
		$this->assertSame( array( 'Tokens for beginners' ), $this->titles( array( 'level' => 'beginner', 'cat' => 'prompting' ) ) );
		$this->assertSame( array( 'Tokens for builders' ), $this->titles( array( 'level' => 'advanced', 'q' => 'Tokens' ) ) );
		$this->assertSame( array(), $this->titles( array( 'level' => 'intermediate' ) ) );
		$args = ideatoapps_blog_query_args( array( 'level' => 'advanced', 'cat' => 'prompting', 'q' => 'Tokens', 'pg' => '2' ) );
		$this->assertSame( 2, $args['paged'] );
		$this->assertSame( 'prompting', $args['category_name'] );
		$this->assertSame( 'Tokens', $args['s'] );
		$this->assertSame( array( array( 'key' => 'ita_level', 'value' => 'advanced' ) ), $args['meta_query'] );
	}

	public function test_urls_keep_the_level_and_it_counts_as_a_filter(): void {
		$req = array( 'cat' => 'llms', 'level' => 'beginner', 'q' => 'a b', 'pg' => 1 );
		$this->assertSame( 'https://example.test/blog/?cat=llms&level=beginner&q=a%20b&pg=2', ideatoapps_blog_url( $req, 2, 'https://example.test/blog/' ) );
		$this->assertSame( 'https://example.test/blog/?level=advanced', ideatoapps_blog_url( array( 'cat' => '', 'level' => 'advanced', 'q' => '' ), 1, 'https://example.test/blog/' ) );
		$this->assertSame( 'https://example.test/blog/', ideatoapps_blog_url( array( 'cat' => '', 'level' => '<b>', 'q' => '' ), 1, 'https://example.test/blog/' ), 'only a known level is written' );
		$this->assertTrue( ideatoapps_blog_is_filtered( array( 'cat' => '', 'level' => 'beginner', 'q' => '', 'pg' => 1 ) ) );
		$this->assertFalse( ideatoapps_blog_has_featured( array( 'cat' => '', 'level' => 'beginner', 'q' => '', 'pg' => 1 ), 20 ) );
	}

	public function test_level_counts_cover_published_posts_with_a_known_level_only(): void {
		$this->post( 'B1', 'beginner' );
		$this->post( 'B2', 'beginner' );
		$this->post( 'A1', 'advanced' );
		$this->post( 'Odd', 'expert' );
		$draft = (int) wp_insert_post( array( 'post_status' => 'draft', 'post_title' => 'Draft' ) );
		update_post_meta( $draft, 'ita_level', 'intermediate' );
		$this->assertSame( array( 'beginner' => 2, 'advanced' => 1 ), ideatoapps_blog_level_counts() );
	}

	public function test_level_chips_link_mark_current_keep_filters_and_hide_counts_while_searching(): void {
		$this->post( 'B1', 'beginner', '', array( $this->cat( 'prompting' ) ) );
		$this->post( 'I1', 'intermediate' );
		$req  = array( 'cat' => 'prompting', 'level' => 'beginner', 'q' => '', 'pg' => 1 );
		$html = $this->render( 'blog-filters', array( 'req' => $req, 'categories' => ideatoapps_blog_categories(), 'found' => 1 ) );
		$this->assertMatchesRegularExpression( '#<nav class="blog-chips blog-chips--level" aria-label="Level" data-testid="blog-levels">#', $html );
		preg_match( '#data-testid="blog-levels">(.*?)</nav>#s', $html, $nav );
		preg_match_all( '#<a class="blog-chip" href="([^"]+)"( aria-current="page")?>(.*?)</a>#s', $nav[1], $m, PREG_SET_ORDER );
		$this->assertCount( 3, $m, 'All levels, Beginner, Intermediate (no advanced posts: no chip)' );
		$this->assertStringStartsWith( 'All levels', $m[0][3] );
		$this->assertStringNotContainsString( 'level=', $m[0][1] );
		$this->assertStringContainsString( 'cat=prompting', $m[0][1] );
		$this->assertStringContainsString( 'level=beginner', $m[1][1] );
		$this->assertStringContainsString( 'cat=prompting', $m[1][1] );
		$this->assertSame( array( '', ' aria-current="page"', '' ), array_map( static fn( $x ) => $x[2], $m ) );
		$this->assertStringContainsString( 'Beginner <span class="blog-chip__count" aria-hidden="true">1</span><span class="screen-reader-text"> article</span>', $m[1][3] );
		$this->assertStringContainsString( '<input type="hidden" name="level" value="beginner">', $html );
		preg_match( '#data-testid="blog-chips">(.*?)</nav>#s', $html, $cats );
		$this->assertStringContainsString( 'level=beginner', $cats[1], 'category chips keep the level' );
		$q = $this->render( 'blog-filters', array( 'req' => array( 'q' => 'tokens' ) + $req, 'categories' => array(), 'found' => 1 ) );
		preg_match( '#data-testid="blog-levels">(.*?)</nav>#s', $q, $qnav );
		$this->assertStringNotContainsString( 'blog-chip__count', $qnav[1] );
		$this->assertStringContainsString( 'q=tokens', $qnav[1] );
	}

	public function test_no_level_chips_when_no_post_has_a_level(): void {
		$this->post( 'Plain' );
		$html = $this->render( 'blog-filters', array( 'req' => array( 'cat' => '', 'level' => '', 'q' => '', 'pg' => 1 ), 'found' => 1 ) );
		$this->assertStringNotContainsString( 'blog-levels', $html );
		$this->assertStringNotContainsString( 'name="level"', $html );
	}

	public function test_post_audience_part_shows_badge_chips_and_who_this_is_for_escaped(): void {
		$id   = $this->post( 'P', 'intermediate', 'workers-and-business-owners,builders,<b>x</b>,builders' );
		$html = $this->render( 'post-audience', array( 'post_id' => $id ) );
		$this->assertStringContainsString( 'data-testid="post-level"', $html );
		$this->assertMatchesRegularExpression( '#<span class="post-level post-level--intermediate" data-testid="post-level"><span class="screen-reader-text">Level: </span>Intermediate</span>#', $html );
		$this->assertStringContainsString( 'Who this is for:', $html );
		preg_match_all( '#<li class="post-audience__chip">(.*?)</li>#', $html, $chips );
		$this->assertSame( array( 'Workers and business owners', 'Builders' ), $chips[1], 'unknown and repeated values are dropped' );
		$this->assertStringNotContainsString( '<b>', $html );
		$this->assertSame( array( 'workers-and-business-owners' => 'Workers and business owners', 'builders' => 'Builders' ), ideatoapps_post_audiences( $id ) );
	}

	public function test_post_audience_part_is_empty_without_a_known_level_and_audiences(): void {
		$this->assertSame( '', trim( $this->render( 'post-audience', array( 'post_id' => $this->post( 'Plain' ) ) ) ) );
		$this->assertSame( '', trim( $this->render( 'post-audience', array( 'post_id' => $this->post( 'Odd', 'expert', 'robots' ) ) ) ) );
		$this->assertSame( '', ideatoapps_post_level( $this->post( 'Case', 'Beginner' ) ) );
		$only = $this->render( 'post-audience', array( 'post_id' => $this->post( 'Lvl', 'advanced' ) ) );
		$this->assertStringContainsString( 'Advanced', $only );
		$this->assertStringNotContainsString( 'Who this is for', $only, 'no audiences, no line' );
	}

	public function test_cards_show_the_level(): void {
		$html = $this->render( 'post-list', array( 'posts' => array( get_post( $this->post( 'B', 'beginner' ) ), get_post( $this->post( 'Plain' ) ) ) ) );
		$this->assertSame( 1, substr_count( $html, 'data-testid="card-level"' ) );
		$this->assertStringContainsString( '<p class="card__level" data-testid="card-level"><span class="screen-reader-text">Level: </span>Beginner</p>', $html );
	}

	public function test_level_counts_are_cached_and_refreshed_when_posts_or_levels_change(): void {
		$this->post( 'B1', 'beginner' );
		$this->assertSame( array( 'beginner' => 1 ), ideatoapps_blog_level_counts() );
		$this->assertSame( array( 'beginner' => 1 ), wp_cache_get( 'level_counts', 'ideatoapps_blog' ), 'kept in the object cache' );
		global $wpdb;
		$before = $wpdb->num_queries;
		ideatoapps_blog_level_counts();
		$this->assertSame( $before, $wpdb->num_queries, 'a second call does not query' );
		$draft = (int) wp_insert_post( array( 'post_status' => 'draft', 'post_title' => 'Later' ) );
		update_post_meta( $draft, 'ita_level', 'advanced' );
		$this->assertSame( array( 'beginner' => 1 ), ideatoapps_blog_level_counts(), 'a draft does not count' );
		wp_publish_post( $draft );
		$this->assertSame( array( 'beginner' => 1, 'advanced' => 1 ), ideatoapps_blog_level_counts(), 'publishing refreshes the counts' );
		update_post_meta( $draft, 'ita_level', 'beginner' );
		$this->assertSame( array( 'beginner' => 2 ), ideatoapps_blog_level_counts(), 'a level change refreshes the counts' );
		wp_trash_post( $draft );
		$this->assertSame( array( 'beginner' => 1 ), ideatoapps_blog_level_counts(), 'trashing refreshes the counts' );
		$id = $this->post( 'B2', 'beginner' );
		$this->assertSame( array( 'beginner' => 2 ), ideatoapps_blog_level_counts() );
		wp_delete_post( $id, true );
		$this->assertSame( array( 'beginner' => 1 ), ideatoapps_blog_level_counts(), 'deleting refreshes the counts' );
	}
}
