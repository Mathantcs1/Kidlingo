<?php
require_once __DIR__ . '/WPTestCase.php';

/**
 * Blog index: request parsing (cat, q, pg), WP_Query args, the category list and the featured-post rule.
 * Odd input never errors: it is ignored or capped.
 */
final class BlogQueryTest extends WPTestCase {
	protected function setUp(): void {
		parent::setUp();
		wp_delete_post( 1, true ); // the sample post: each test decides what the blog holds.
	}

	private function term( string $name, string $slug ): int {
		return (int) wp_insert_term( $name, 'category', array( 'slug' => $slug ) )['term_id'];
	}

	private function post( string $title, array $cats = array(), array $extra = array() ): int {
		return (int) wp_insert_post( array_merge( array( 'post_status' => 'publish', 'post_type' => 'post', 'post_title' => $title, 'post_content' => 'Body of ' . $title, 'post_category' => $cats ), $extra ) );
	}

	private function titles( array $args ): array {
		return wp_list_pluck( ( new WP_Query( $args ) )->posts, 'post_title' );
	}

	public function test_defaults_match_the_old_list_and_page_size_is_twelve(): void {
		$args = ideatoapps_blog_query_args( array() );
		$this->assertSame( 12, IDEATOAPPS_BLOG_PER_PAGE );
		$this->assertSame( 'post', $args['post_type'] );
		$this->assertSame( 'publish', $args['post_status'] );
		$this->assertTrue( $args['ignore_sticky_posts'] );
		$this->assertSame( array( 'date' => 'DESC', 'ID' => 'DESC' ), $args['orderby'] );
		$this->assertSame( 12, $args['posts_per_page'] );
		$this->assertSame( 1, $args['paged'] );
		$this->assertArrayNotHasKey( 's', $args );
		$this->assertArrayNotHasKey( 'category_name', $args );
	}

	public function test_a_500_character_search_is_capped_at_80_characters(): void {
		$args = ideatoapps_blog_query_args( array( 'q' => str_repeat( 'a', 500 ) ) );
		$this->assertSame( str_repeat( 'a', 80 ), $args['s'] );
		$multi = ideatoapps_blog_query_args( array( 'q' => str_repeat( '日本語', 200 ) ) );
		$this->assertSame( 80, mb_strlen( $multi['s'], 'UTF-8' ), 'counted in characters, not bytes' );
		$this->assertSame( 1, preg_match( '//u', $multi['s'] ), 'never cut inside a character' );
		$this->assertSame( 80, mb_strlen( ideatoapps_blog_query_args( array( 'q' => str_repeat( 'é', 5000 ) ) )['s'], 'UTF-8' ) );
		$padded = ideatoapps_blog_query_args( array( 'q' => str_repeat( 'x', 79 ) . '   tail' ) );
		$this->assertSame( str_repeat( 'x', 79 ), $padded['s'], 'no trailing space after the cap' );
	}

	public function test_markup_is_stripped_whitespace_collapsed_and_empty_means_no_search(): void {
		$this->assertArrayNotHasKey( 's', ideatoapps_blog_query_args( array( 'q' => '<script>' ) ) );
		$this->assertArrayNotHasKey( 's', ideatoapps_blog_query_args( array( 'q' => '<script>alert(1)</script>' ) ) );
		$this->assertArrayNotHasKey( 's', ideatoapps_blog_query_args( array( 'q' => "  \t\n  " ) ) );
		$this->assertSame( 'hello', ideatoapps_blog_query_args( array( 'q' => '<script>alert(1)</script>hello' ) )['s'] );
		$this->assertSame( 'bold text here', ideatoapps_blog_query_args( array( 'q' => "  <b>bold</b>  \n text\t\t here " ) )['s'] );
		$this->assertSame( 'a b', ideatoapps_blog_query_args( array( 'q' => "a\u{00A0}\u{2003}b" ) )['s'], 'unicode spaces collapse too' );
	}

	public function test_unicode_search_survives(): void {
		$this->assertSame( 'café 日本語 ñandú', ideatoapps_blog_query_args( array( 'q' => 'café 日本語 ñandú' ) )['s'] );
		$bad = ideatoapps_blog_query_args( array( 'q' => "o\xC3\x28k" ) )['s'] ?? '';
		$this->assertSame( 1, preg_match( '//u', $bad ), 'invalid UTF-8 never errors and never survives' );
	}

	public function test_array_and_non_string_params_are_ignored_without_error(): void {
		$this->term( 'Prompting', 'prompting' );
		$this->post( 'One', array( get_term_by( 'slug', 'prompting', 'category' )->term_id ) );
		foreach ( array( array( 'q' => array( 'x' ), 'cat' => array( 'y' ) ), array( 'q' => array( 'a' => array( 'b' ) ), 'cat' => array( 'prompting' ), 'pg' => array( '2' ) ), array( 'q' => 5, 'cat' => 7, 'pg' => 2.5 ), array( 'q' => null, 'cat' => false, 'pg' => null ) ) as $i => $get ) {
			$args = ideatoapps_blog_query_args( $get );
			$this->assertArrayNotHasKey( 's', $args, "case $i" );
			$this->assertArrayNotHasKey( 'category_name', $args, "case $i" );
			$this->assertSame( 1, $args['paged'], "case $i" );
			$this->assertIsArray( ( new WP_Query( $args ) )->posts );
		}
	}

	public function test_only_an_existing_category_slug_is_used(): void {
		$cat = $this->term( 'Prompting', 'prompting' );
		$this->post( 'In it', array( $cat ) );
		$this->assertSame( 'prompting', ideatoapps_blog_query_args( array( 'cat' => 'prompting' ) )['category_name'] );
		foreach ( array( 'nope', 'Prompting', '../../etc/passwd', "prompting' OR 1=1", 'prompting,llms', 'a b', str_repeat( 'x', 500 ), '', ' prompting', 'uncategorized' ) as $bad ) {
			$this->assertArrayNotHasKey( 'category_name', ideatoapps_blog_query_args( array( 'cat' => $bad ) ), $bad );
		}
		$this->term( 'Empty', 'empty-one' );
		$this->assertArrayNotHasKey( 'category_name', ideatoapps_blog_query_args( array( 'cat' => 'empty-one' ) ), 'a category with no published post is ignored' );
	}

	public function test_page_number_is_digits_only_and_defaults_to_one(): void {
		$this->assertSame( 3, ideatoapps_blog_query_args( array( 'pg' => '3' ) )['paged'] );
		$this->assertSame( 4, ideatoapps_blog_query_args( array( 'pg' => 4 ) )['paged'] );
		foreach ( array( '0', '-5', 'abc', '2abc', '', ' 2', '1e3', '9999999999' ) as $bad ) {
			$this->assertSame( 1, ideatoapps_blog_query_args( array( 'pg' => $bad ) )['paged'], $bad );
		}
	}

	public function test_filters_combine_and_pagination_args_keep_them(): void {
		$a = $this->term( 'AI basics', 'ai-basics' );
		$b = $this->term( 'Prompting', 'prompting' );
		$this->post( 'Tokens explained', array( $a ), array( 'post_date' => '2026-01-03 10:00:00' ) );
		$this->post( 'Tokens in prompts', array( $b ), array( 'post_date' => '2026-01-02 10:00:00' ) );
		$this->post( 'Chatbots', array( $a ), array( 'post_date' => '2026-01-01 10:00:00' ) );
		$both = ideatoapps_blog_query_args( array( 'cat' => 'ai-basics', 'q' => 'Tokens', 'pg' => '2' ) );
		$this->assertSame( 'ai-basics', $both['category_name'] );
		$this->assertSame( 'Tokens', $both['s'] );
		$this->assertSame( 2, $both['paged'] );
		$both['paged'] = 1;
		$this->assertSame( array( 'Tokens explained' ), $this->titles( $both ) );
		$this->assertSame( array( 'Tokens explained', 'Tokens in prompts' ), $this->titles( ideatoapps_blog_query_args( array( 'q' => 'Tokens' ) ) ) );
		$this->assertSame( array( 'Tokens explained', 'Chatbots' ), $this->titles( ideatoapps_blog_query_args( array( 'cat' => 'ai-basics' ) ) ) );
		$this->assertSame( array(), $this->titles( ideatoapps_blog_query_args( array( 'cat' => 'prompting', 'q' => 'Chatbots' ) ) ) );
		$this->assertSame( array( 'Tokens explained', 'Tokens in prompts', 'Chatbots' ), $this->titles( ideatoapps_blog_query_args( array() ) ), 'newest first, as before' );
	}

	public function test_urls_keep_cat_and_q_urlencoded_and_drop_defaults(): void {
		$req = array( 'cat' => 'ai-basics', 'q' => 'a & b "x" é', 'pg' => 1 );
		$url = ideatoapps_blog_url( $req, 3, 'https://example.test/blog/' );
		$this->assertSame( 'https://example.test/blog/?cat=ai-basics&q=a%20%26%20b%20%22x%22%20%C3%A9&pg=3', $url );
		$this->assertSame( 'https://example.test/blog/?cat=ai-basics&q=a%20%26%20b%20%22x%22%20%C3%A9', ideatoapps_blog_url( $req, 1, 'https://example.test/blog/' ), 'page 1 has no pg' );
		$this->assertSame( 'https://example.test/blog/', ideatoapps_blog_url( array( 'cat' => '', 'q' => '', 'pg' => 1 ), 1, 'https://example.test/blog/' ) );
		parse_str( (string) wp_parse_url( $url, PHP_URL_QUERY ), $back );
		$this->assertSame( 'a & b "x" é', $back['q'], 'round trips' );
	}

	public function test_category_list_has_only_published_non_default_categories_with_counts_in_topic_order(): void {
		$ids = array();
		foreach ( array( 'zeta' => 'Zeta', 'alpha' => 'Alpha', 'safety-and-judgment' => 'Safety and judgment', 'ai-basics' => 'AI basics', 'prompting' => 'Prompting', 'llms' => 'LLMs', 'agents' => 'Agents', 'work-and-learning' => 'Work and learning', 'empty-cat' => 'Empty', 'draft-only' => 'Draft only' ) as $slug => $name ) {
			$ids[ $slug ] = $this->term( $name, $slug );
		}
		foreach ( array( 'zeta', 'alpha', 'safety-and-judgment', 'ai-basics', 'prompting', 'llms', 'agents', 'work-and-learning' ) as $slug ) {
			$this->post( 'P ' . $slug, array( $ids[ $slug ] ) );
		}
		$this->post( 'P ai 2', array( $ids['ai-basics'] ) );
		$this->post( 'P ai 3', array( $ids['ai-basics'] ) );
		$this->post( 'Hidden', array( $ids['draft-only'] ), array( 'post_status' => 'draft' ) );
		$this->post( 'Plain' ); // lands in the default "Uncategorized"
		$rows = ideatoapps_blog_categories();
		$this->assertSame( array( 'ai-basics', 'prompting', 'llms', 'agents', 'work-and-learning', 'safety-and-judgment', 'alpha', 'zeta' ), array_column( $rows, 'slug' ) );
		$this->assertSame( 3, $rows[0]['count'] );
		$this->assertSame( 'AI basics', $rows[0]['name'] );
		$this->assertSame( array( 1 ), array_unique( array_slice( array_column( $rows, 'count' ), 1 ) ) );
		$this->assertNotContains( 'uncategorized', array_column( $rows, 'slug' ) );
		$this->assertNotContains( 'empty-cat', array_column( $rows, 'slug' ) );
		$this->assertNotContains( 'draft-only', array_column( $rows, 'slug' ) );
	}

	public function test_category_list_is_empty_on_a_blog_with_no_categorised_posts(): void {
		$this->post( 'Plain' );
		$this->assertSame( array(), ideatoapps_blog_categories() );
	}

	public function test_featured_is_the_newest_post_only_on_an_unfiltered_first_page_with_four_or_more_posts(): void {
		$none = array( 'cat' => '', 'q' => '', 'pg' => 1 );
		$this->assertTrue( ideatoapps_blog_has_featured( $none, 4 ) );
		$this->assertTrue( ideatoapps_blog_has_featured( $none, 40 ) );
		$this->assertFalse( ideatoapps_blog_has_featured( $none, 3 ) );
		$this->assertFalse( ideatoapps_blog_has_featured( $none, 0 ) );
		$this->assertFalse( ideatoapps_blog_has_featured( array( 'cat' => 'x', 'q' => '', 'pg' => 1 ), 9 ) );
		$this->assertFalse( ideatoapps_blog_has_featured( array( 'cat' => '', 'q' => 'x', 'pg' => 1 ), 9 ) );
		$this->assertFalse( ideatoapps_blog_has_featured( array( 'cat' => '', 'q' => '', 'pg' => 2 ), 30 ) );
	}

	public function test_filter_state_helper(): void {
		$this->assertFalse( ideatoapps_blog_is_filtered( array( 'cat' => '', 'q' => '', 'pg' => 5 ) ) );
		$this->assertTrue( ideatoapps_blog_is_filtered( array( 'cat' => 'a', 'q' => '', 'pg' => 1 ) ) );
		$this->assertTrue( ideatoapps_blog_is_filtered( array( 'cat' => '', 'q' => 'a', 'pg' => 1 ) ) );
	}

	public function test_out_of_range_page_counts_use_the_filtered_query(): void {
		$cat = $this->term( 'AI basics', 'ai-basics' );
		for ( $i = 1; $i <= 13; $i++ ) {
			$this->post( 'Basics ' . $i, array( $cat ) );
		}
		$this->post( 'Other' );
		$args = ideatoapps_blog_query_args( array( 'cat' => 'ai-basics', 'pg' => '99' ) );
		$this->assertSame( 2, ideatoapps_list_page_count( $args ) );
		$this->assertSame( 2, ideatoapps_list_page_count( ideatoapps_blog_query_args( array() ) ) );
		$this->assertSame( 0, ideatoapps_list_page_count( ideatoapps_blog_query_args( array( 'q' => 'zzzznothing' ) ) ) );
	}
}
