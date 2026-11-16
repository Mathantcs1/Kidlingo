<?php
require_once __DIR__ . '/SeoTestCase.php';

/**
 * Single-post helpers: reading time, table-of-contents ids, "Read next", the last-reviewed date and the template slots.
 */
final class PostExtrasTest extends SeoTestCase {
	private function words( int $n ): string {
		return implode( ' ', array_fill( 0, $n, 'word' ) );
	}

	private function post( string $content = 'Body.', array $extra = array() ): int {
		return (int) wp_insert_post( array_merge( array( 'post_status' => 'publish', 'post_type' => 'post', 'post_title' => 'T' . wp_generate_password( 6, false ), 'post_content' => $content ), $extra ) );
	}

	public function test_reading_time_rounds_up_with_a_minimum_of_one(): void {
		$this->assertSame( 1, ideatoapps_reading_minutes( $this->post( '' ) ) );
		$this->assertSame( 1, ideatoapps_reading_minutes( $this->post( $this->words( 220 ) ) ) );
		$this->assertSame( 2, ideatoapps_reading_minutes( $this->post( $this->words( 221 ) ) ) );
		$this->assertSame( 5, ideatoapps_reading_minutes( $this->post( $this->words( 1000 ) ) ) );
		$this->assertSame( 1, ideatoapps_reading_minutes( 0 ) );
	}

	public function test_reading_time_ignores_tags_and_shortcode_markup(): void {
		$body = '<p>' . $this->words( 200 ) . '</p>[ita_prompt title="one two three four five six seven eight nine ten eleven twelve" class="a b c d e f g h i j k l m n o p"]'
			. '[/ita_prompt]<img src="x.png" alt="a b c d e f g h i j k l m n o p q r s t u v w x y z">';
		$this->assertSame( 1, ideatoapps_reading_minutes( $this->post( $body ) ) );
		$this->assertSame( 2, ideatoapps_reading_minutes( $this->post( $body . '[ita_prompt]' . $this->words( 30 ) . '[/ita_prompt]' ) ), 'text inside a shortcode counts' );
	}

	public function test_toc_adds_stable_unique_ids_to_h2_only(): void {
		$html   = '<h2>Getting started</h2><p>x</p><h3>Sub</h3><h2>Getting started</h2><h2>Getting started</h2><h2>What is AI?</h2>';
		$result = ideatoapps_post_toc( $html );
		$this->assertSame( array( 'getting-started', 'getting-started-2', 'getting-started-3', 'what-is-ai' ), array_column( $result['items'], 'id' ) );
		$this->assertSame( array( 'Getting started', 'Getting started', 'Getting started', 'What is AI?' ), array_column( $result['items'], 'text' ) );
		$this->assertStringContainsString( '<h2 id="getting-started-2">', $result['html'] );
		$this->assertStringContainsString( '<h3>Sub</h3>', $result['html'], 'h3 is untouched' );
		$this->assertSame( $result, ideatoapps_post_toc( $html ), 'same input, same ids' );
	}

	public function test_toc_keeps_existing_attributes_and_never_reuses_an_existing_id(): void {
		$html   = '<h2 class="x" data-id="7">First</h2><h2 id="first" class="y">Mine</h2><h2 ID=\'custom\'>Custom</h2><div id="first-2"></div>';
		$result = ideatoapps_post_toc( $html );
		$this->assertStringContainsString( '<h2 class="x" data-id="7" id="first-3">', $result['html'] );
		$this->assertStringContainsString( '<h2 id="first" class="y">', $result['html'] );
		$this->assertStringContainsString( "<h2 ID='custom'>", $result['html'] );
		$this->assertSame( array( 'first-3', 'first', 'custom' ), array_column( $result['items'], 'id' ) );
	}

	public function test_toc_ignores_headings_without_text_and_strips_inner_tags_and_entities(): void {
		$html   = '<h2></h2><h2>  </h2><h2><img src="a.png" alt=""></h2><h2><em>Bold</em> &amp; <a href="#x">linked</a></h2><h2>???</h2>';
		$result = ideatoapps_post_toc( $html );
		$this->assertCount( 2, $result['items'] );
		$this->assertSame( 'Bold & linked', $result['items'][0]['text'] );
		$this->assertSame( 'bold-linked', $result['items'][0]['id'] );
		$this->assertNotSame( '', $result['items'][1]['id'], 'a heading with only punctuation still gets an id' );
		$this->assertStringContainsString( '<h2></h2><h2>  </h2><h2><img src="a.png" alt=""></h2>', $result['html'] );
		$this->assertSame( array( 'html' => '', 'items' => array() ), ideatoapps_post_toc( '' ) );
	}

	public function test_toc_never_uses_an_id_the_page_already_has_elsewhere(): void {
		$result = ideatoapps_post_toc( '<h2>Main</h2><h2>Newsletter</h2><h2>Nav drawer</h2><h2>Newsletter email</h2><h2>Read next title</h2><h2>Post next title</h2>' );
		$ids    = array_column( $result['items'], 'id' );
		foreach ( array( 'main', 'newsletter', 'newsletter-email', 'nav-drawer', 'post-next-title' ) as $reserved ) {
			$this->assertNotContains( $reserved, $ids );
		}
		$this->assertSame( 'main-2', $ids[0] );
		$this->assertStringContainsString( '<h2 id="main-2">Main</h2>', $result['html'] );
		$this->assertSame( 'newsletter-2', $ids[1] );
		$this->assertSame( 'newsletter-email-2', $ids[3] );
		$this->assertSame( count( $ids ), count( array_unique( $ids ) ) );
	}

	public function test_toc_ids_are_ascii_for_any_heading(): void {
		$result = ideatoapps_post_toc( '<h2>你好世界</h2><h2>🙂🙂</h2><h2>100% sure</h2><h2>Café Über</h2><h2>你好</h2>' );
		$ids    = array_column( $result['items'], 'id' );
		$this->assertCount( 5, $ids );
		foreach ( $ids as $id ) {
			$this->assertMatchesRegularExpression( '/\A[a-z0-9-]+\z/', $id );
			$this->assertStringContainsString( ' id="' . $id . '"', $result['html'] );
		}
		$this->assertSame( array( 'section-1', 'section-2', '100-sure', 'cafe-uber', 'section-5' ), $ids );
		$this->assertSame( '你好世界', $result['items'][0]['text'], 'the visible text keeps its characters' );
	}

	public function test_toc_keeps_an_author_id_with_a_percent_sign_and_handles_a_gt_inside_an_attribute(): void {
		$result = ideatoapps_post_toc( '<h2 id="50%">Half</h2><h2 data-note="a > b" class="c">Quoted</h2>' );
		$this->assertSame( '50%', $result['items'][0]['id'] );
		$this->assertSame( '<h2 id="50%">Half</h2><h2 data-note="a > b" class="c" id="quoted">Quoted</h2>', $result['html'] );
	}

	public function test_toc_survives_huge_opening_tags_and_never_blanks_the_content(): void {
		$cases = array(
			'20k chars of attributes' => '<h2 data-x="' . str_repeat( 'a', 20000 ) . '">Big</h2>',
			'100k attributes'         => '<h2' . str_repeat( ' data-n="1"', 100000 ) . '>Many</h2>',
			'gt in a value'           => '<h2 data-n="a > b">Gt</h2>',
		);
		foreach ( $cases as $name => $h2 ) {
			$html   = '<p>Before</p>' . $h2 . '<p>After</p>';
			$result = ideatoapps_post_toc( $html );
			$this->assertSame( PREG_NO_ERROR, preg_last_error(), $name );
			$this->assertStringContainsString( '<p>Before</p>', $result['html'], $name );
			$this->assertStringContainsString( '<p>After</p>', $result['html'], $name );
			$this->assertCount( 1, $result['items'], $name );
			$this->assertStringContainsString( ' id="', $result['html'], $name );
		}
	}

	public function test_read_next_prefers_the_same_category_then_newest_and_excludes_current_and_unpublished(): void {
		$cat_a = wp_insert_term( 'Alpha', 'category' )['term_id'];
		$cat_b = wp_insert_term( 'Beta', 'category' )['term_id'];
		$cur   = $this->post( 'x', array( 'post_category' => array( $cat_a ), 'post_date' => '2026-01-05 10:00:00' ) );
		$a_old = $this->post( 'x', array( 'post_category' => array( $cat_a ), 'post_date' => '2026-01-01 10:00:00' ) );
		$a_new = $this->post( 'x', array( 'post_category' => array( $cat_a ), 'post_date' => '2026-01-04 10:00:00' ) );
		$b_new = $this->post( 'x', array( 'post_category' => array( $cat_b ), 'post_date' => '2026-01-09 10:00:00' ) );
		$b_old = $this->post( 'x', array( 'post_category' => array( $cat_b ), 'post_date' => '2026-01-02 10:00:00' ) );
		$this->post( 'x', array( 'post_category' => array( $cat_a ), 'post_status' => 'draft' ) );
		$this->post( 'x', array( 'post_category' => array( $cat_a ), 'post_status' => 'private' ) );
		$this->post( 'x', array( 'post_category' => array( $cat_a ), 'post_status' => 'future', 'post_date' => '2099-01-01 10:00:00' ) );

		$ids = array_map( static fn( $p ) => $p->ID, ideatoapps_read_next( $cur, 3 ) );
		$this->assertSame( array( $a_new, $a_old, $b_new ), $ids );
		$this->assertNotContains( $cur, array_map( static fn( $p ) => $p->ID, ideatoapps_read_next( $cur, 10 ) ) );
		$this->assertSame( array( $a_new, $a_old, $b_new, $b_old ), array_map( static fn( $p ) => $p->ID, ideatoapps_read_next( $cur, 10 ) ), 'fewer than asked is fine' );
		$this->assertSame( array(), ideatoapps_read_next( $cur, 0 ) );
	}

	public function test_read_next_with_a_single_post_is_empty(): void {
		$this->assertSame( array(), ideatoapps_read_next( $this->post( 'x' ), 3 ) );
	}

	public function test_last_reviewed_is_valid_only_for_a_real_iso_date(): void {
		$id = $this->post( 'x' );
		$this->assertNull( ideatoapps_last_reviewed( $id ) );
		foreach ( array( '2026-02-30', '2026-13-01', 'yesterday', '26-01-01', '2026-1-1', "2026-01-01\n<script>", '' ) as $bad ) {
			update_post_meta( $id, 'ita_last_reviewed', $bad );
			$this->assertNull( ideatoapps_last_reviewed( $id ), "invalid: $bad" );
		}
		update_post_meta( $id, 'ita_last_reviewed', '2026-02-28' );
		$this->assertSame( '2026-02-28', ideatoapps_last_reviewed( $id ) );
	}

	public function test_last_reviewed_meta_sanitises_through_the_api(): void {
		$id = $this->post( 'x' );
		update_post_meta( $id, 'ita_last_reviewed', '<b>2026-02-31</b>' );
		$this->assertSame( '', get_post_meta( $id, 'ita_last_reviewed', true ) );
		update_post_meta( $id, 'ita_last_reviewed', '2026-03-01' );
		$this->assertSame( '2026-03-01', get_post_meta( $id, 'ita_last_reviewed', true ) );
	}

	private function render_single( int $id ): string {
		$this->go_to( get_permalink( $id ) );
		$this->assertTrue( is_singular( 'post' ) );
		ob_start();
		while ( have_posts() ) { // the article part, not single.php: get_header() uses require_once, so a second full-page render has no header.
			the_post();
			ideatoapps_part( 'post-article' );
		}
		return (string) ob_get_clean();
	}

	private function headings( int $n ): string {
		$out = '';
		for ( $i = 1; $i <= $n; $i++ ) {
			$out .= "<h2>Part $i</h2><p>Text $i.</p>";
		}
		return $out;
	}

	public function test_single_template_shows_toc_only_from_three_headings_and_the_meta_row(): void {
		$few  = $this->post( $this->headings( 2 ), array( 'post_title' => 'Few' ) );
		$html = $this->render_single( $few );
		$this->assertStringContainsString( 'data-testid="post"', $html );
		$this->assertStringContainsString( 'data-testid="post-meta"', $html );
		$this->assertStringContainsString( 'min read', $html );
		$this->assertStringNotContainsString( 'data-testid="post-toc"', $html );
		$this->assertStringNotContainsString( 'Last reviewed', $html );

		$many = $this->post( $this->headings( 3 ) );
		update_post_meta( $many, 'ita_last_reviewed', '2026-02-28' );
		$html = $this->render_single( $many );
		$this->assertStringContainsString( 'data-testid="post-toc"', $html );
		$this->assertStringContainsString( 'href="#part-2"', $html );
		$this->assertStringContainsString( '<h2 id="part-2">Part 2</h2>', $html );
		$this->assertMatchesRegularExpression( '/Last reviewed\s*<time datetime="2026-02-28">/', $html );
		$this->assertStringContainsString( 'data-testid="post-progress"', $html );
		$this->assertStringContainsString( 'aria-hidden="true"', $html );
	}

	public function test_single_template_slots_are_empty_by_default_and_filterable_and_read_next_lists_other_posts(): void {
		$id    = $this->post( 'Hi', array( 'post_title' => 'Solo' ) );
		$html  = $this->render_single( $id );
		$this->assertStringNotContainsString( 'post-hero__media', $html );
		$this->assertStringNotContainsString( 'post-byline', $html );
		$this->assertStringNotContainsString( 'data-testid="post-read-next"', $html );

		$other = $this->post( 'Other', array( 'post_title' => 'Other one' ) );
		add_filter( 'ideatoapps_post_hero_html', static fn( $h, $pid ) => '<figure id="hero-slot">' . $pid . '</figure>', 10, 2 );
		add_filter( 'ideatoapps_post_byline_html', static fn() => 'Byline <b>text</b>' );
		$html = $this->render_single( $id );
		remove_all_filters( 'ideatoapps_post_hero_html' );
		remove_all_filters( 'ideatoapps_post_byline_html' );
		$this->assertStringContainsString( '<figure id="hero-slot">' . $id . '</figure>', $html );
		$this->assertStringContainsString( 'Byline <b>text</b>', $html );
		$this->assertStringContainsString( 'data-testid="post-read-next"', $html );
		$this->assertStringContainsString( 'Other one', $html );
		$this->assertStringNotContainsString( '>Solo</a>', $html, 'the current post is not its own read-next' );
		$this->assertStringContainsString( '<h3 class="card__title">', $html );
	}

	public function test_post_assets_load_only_on_single_posts(): void {
		$id = $this->post( 'x' );
		wp_dequeue_style( 'ideatoapps-post' );
		wp_dequeue_script( 'ideatoapps-post' );
		$this->go_to( get_permalink( $id ) );
		do_action( 'wp_enqueue_scripts' );
		$this->assertTrue( wp_style_is( 'ideatoapps-post', 'enqueued' ) );
		$this->assertTrue( wp_script_is( 'ideatoapps-post', 'enqueued' ) );
		wp_dequeue_style( 'ideatoapps-post' );
		wp_dequeue_script( 'ideatoapps-post' );
		$this->go_to( home_url( '/blog/' ) );
		do_action( 'wp_enqueue_scripts' );
		$this->assertFalse( wp_style_is( 'ideatoapps-post', 'enqueued' ) );
		$this->assertFalse( wp_script_is( 'ideatoapps-post', 'enqueued' ) );
	}
}
