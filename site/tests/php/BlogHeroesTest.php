<?php
require_once __DIR__ . '/SeoTestCase.php';

/**
 * The 50 topics, their generated hero SVGs and the theme wiring (single post hero, blog cards).
 */
final class BlogHeroesTest extends SeoTestCase {
	private function art_dir( string $kind ): string {
		return IDEATOAPPS_CORE_DIR . 'content/' . $kind;
	}

	/** @return string[] */
	private function shipped( string $kind ): array {
		return glob( $this->art_dir( $kind ) . '/*.svg' ) ?: array();
	}

	/* Topics and heroes */

	/** @return array<int, array<string,string>> */
	private function topics(): array {
		$topics = ideatoapps_blog_topics_data();
		$this->assertIsArray( $topics );
		return $topics;
	}

	public function test_topics_json_lists_the_fifty_topics_in_six_categories(): void {
		$topics = $this->topics();
		$this->assertCount( 50, $topics );
		$labels = array(
			'ai-basics' => 'AI basics', 'prompting' => 'Prompting', 'llms' => 'LLMs', 'agents' => 'Agents',
			'work-and-learning' => 'Work and learning', 'safety-and-judgment' => 'Safety and judgment',
		);
		$sizes = array_fill_keys( array_keys( $labels ), 0 );
		foreach ( $topics as $i => $t ) {
			$keys = array_keys( $t );
			sort( $keys );
			$this->assertSame( array( 'audiences', 'category', 'categoryLabel', 'level', 'slug', 'title' ), $keys );
			$this->assertMatchesRegularExpression( '/^' . sprintf( '%02d', $i + 1 ) . '-[a-z0-9]+(?:-[a-z0-9]+)*$/', $t['slug'] );
			$this->assertNotSame( '', trim( $t['title'] ) );
			$this->assertArrayHasKey( $t['category'], $labels );
			$this->assertSame( $labels[ $t['category'] ], $t['categoryLabel'] );
			++$sizes[ $t['category'] ];
		}
		$this->assertSame( array( 'ai-basics' => 8, 'prompting' => 10, 'llms' => 8, 'agents' => 10, 'work-and-learning' => 8, 'safety-and-judgment' => 6 ), $sizes );
		$this->assertCount( 50, array_unique( array_column( $topics, 'slug' ) ) );
	}

	public function test_every_topic_has_a_hero_file_and_there_are_no_stray_ones(): void {
		$slugs = array_column( $this->topics(), 'slug' );
		foreach ( $slugs as $slug ) {
			$this->assertFileExists( $this->art_dir( 'heroes' ) . "/$slug.svg", $slug );
		}
		$on_disk = array_map( static fn( $f ) => basename( $f, '.svg' ), $this->shipped( 'heroes' ) );
		sort( $slugs );
		sort( $on_disk );
		$this->assertSame( $slugs, $on_disk );
	}

	public function test_heroes_are_distinct_text_free_and_sixteen_by_nine(): void {
		$seen = array();
		foreach ( $this->shipped( 'heroes' ) as $file ) {
			$svg = (string) file_get_contents( $file );
			$this->assertStringContainsString( 'viewBox="0 0 1200 675"', $svg );
			$this->assertDoesNotMatchRegularExpression( '/<(text|tspan|title|desc)\b/', $svg, basename( $file ) . ' must be text-free' );
			$this->assertStringContainsString( 'var(--ita-hero-', $svg );
			$this->assertDoesNotMatchRegularExpression( '/\bid="/', $svg, 'ids would collide when several cards share a page' );
			$seen[ md5( $svg ) ] = true;
		}
		$this->assertCount( count( $this->shipped( 'heroes' ) ), $seen, 'no two heroes are identical' );
	}

	public function test_hero_svg_comes_from_the_starter_slug_meta_only(): void {
		$slug = $this->topics()[0]['slug'];
		$id   = (int) wp_insert_post( array( 'post_status' => 'publish', 'post_title' => 'Starter', 'post_content' => 'x' ) );
		$this->assertSame( '', ideatoapps_post_hero_svg( $id ), 'no meta, no hero' );
		update_post_meta( $id, 'ita_starter_slug', $slug );
		$hero = ideatoapps_post_hero_svg( $id );
		$this->assertStringStartsWith( '<svg', $hero );
		$this->assertStringContainsString( 'aria-hidden="true"', $hero );
		$this->assertStringNotContainsString( 'role="img"', $hero );
		$this->assertStringNotContainsString( '<?xml', $hero );
		foreach ( array( 'no-such-hero', '../figures/agent-loop', '01-', '', 'AGENT' ) as $bad ) {
			update_post_meta( $id, 'ita_starter_slug', $bad );
			$this->assertSame( '', ideatoapps_post_hero_svg( $id ), "meta: $bad" );
		}
		$this->assertSame( '', ideatoapps_post_hero_svg( 0 ) );
		$this->assertSame( '', ideatoapps_post_hero_svg( 999999 ) );
	}

	public function test_starter_slug_meta_is_registered_for_rest_and_sanitised(): void {
		$this->assertTrue( registered_meta_key_exists( 'post', 'ita_starter_slug', 'post' ) );
		$id = (int) wp_insert_post( array( 'post_status' => 'publish', 'post_title' => 'S', 'post_content' => 'x' ) );
		update_post_meta( $id, 'ita_starter_slug', '<b>../Evil</b>' );
		$this->assertSame( '', get_post_meta( $id, 'ita_starter_slug', true ) );
	}

	/* Theme wiring */

	private function render_part( string $name, array $args ): string {
		ob_start();
		ideatoapps_part( $name, $args );
		return (string) ob_get_clean();
	}

	public function test_post_hero_filter_uses_the_svg_only_for_starter_posts_and_never_replaces_other_html(): void {
		$plain = (int) wp_insert_post( array( 'post_status' => 'publish', 'post_title' => 'Plain', 'post_content' => 'x' ) );
		$start = (int) wp_insert_post( array( 'post_status' => 'publish', 'post_title' => 'Start', 'post_content' => 'x' ) );
		update_post_meta( $start, 'ita_starter_slug', $this->topics()[3]['slug'] );
		$this->assertSame( '', apply_filters( 'ideatoapps_post_hero_html', '', $plain ) );
		$this->assertStringStartsWith( '<svg', apply_filters( 'ideatoapps_post_hero_html', '', $start ) );
		$this->assertSame( '<i>mine</i>', apply_filters( 'ideatoapps_post_hero_html', '<i>mine</i>', $start ) );
	}

	public function test_single_post_shows_the_hero_in_a_testid_wrapper_with_a_fixed_ratio_class(): void {
		wp_set_current_user( self::make_user( 'administrator' ) );
		$start = (int) wp_insert_post( array( 'post_status' => 'draft', 'post_title' => 'Start', 'post_content' => 'x' ) );
		update_post_meta( $start, 'ita_starter_slug', $this->topics()[0]['slug'] ); // starter posts publish only after a human sign-off.
		ideatoapps_review_sign_off( $start, ideatoapps_review_fields( $start ), array( 'ita_review_nonce' => wp_create_nonce( 'ita_review_' . $start ), 'ita_review_name' => 'Rev', 'ita_review_check' => array_keys( ideatoapps_review_checklist() ) ) );
		wp_update_post( array( 'ID' => $start, 'post_status' => 'publish' ) );
		$this->go_to( get_permalink( $start ) );
		global $wp_query;
		ob_start();
		while ( have_posts() ) {
			the_post();
			ideatoapps_part( 'post-article' );
		}
		$html = (string) ob_get_clean();
		$this->assertMatchesRegularExpression( '#<div class="post-hero__media" data-testid="post-hero"><svg\b[^>]*aria-hidden="true"#', $html );
		$this->assertStringContainsString( 'data-testid="post"', $html );
		$this->assertSame( 1, $wp_query->post_count );
	}

	public function test_cards_show_the_hero_when_there_is_no_image_and_keep_their_markup_otherwise(): void {
		$hero = '<svg viewBox="0 0 1200 675" aria-hidden="true"><rect width="1" height="1"/></svg>';
		$html = $this->render_part( 'card', array( 'title' => 'T', 'href' => '/t/', 'hero_html' => $hero ) );
		$this->assertStringContainsString( '<div class="card__media card__media--hero" data-testid="card-hero"><svg', $html );
		$none = $this->render_part( 'card', array( 'title' => 'T', 'href' => '/t/' ) );
		$this->assertStringNotContainsString( 'card-hero', $none );
		$this->assertStringNotContainsString( 'card__media', $none );
	}

	public function test_blog_list_cards_get_the_hero_of_starter_posts_without_a_featured_image(): void {
		$start = (int) wp_insert_post( array( 'post_status' => 'publish', 'post_title' => 'Start', 'post_content' => 'x' ) );
		$plain = (int) wp_insert_post( array( 'post_status' => 'publish', 'post_title' => 'Plain', 'post_content' => 'x' ) );
		update_post_meta( $start, 'ita_starter_slug', $this->topics()[5]['slug'] );
		$html = $this->render_part( 'post-list', array( 'posts' => array( get_post( $start ), get_post( $plain ) ) ) );
		$this->assertSame( 1, substr_count( $html, 'data-testid="card-hero"' ) );
		$this->assertSame( 2, substr_count( $html, '<article' ) );
	}
}
