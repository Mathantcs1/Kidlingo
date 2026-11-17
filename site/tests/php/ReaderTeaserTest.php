<?php
/**
 * The teaser of a subscriber-only post: the leading prose blocks of the rendered article (about 120 words, up to the next heading,
 * never more than 200), cut only between top-level blocks, so it never ends inside a tag, a shortcode's markup, a table or a prompt box.
 */
final class ReaderTeaserTest extends WPTestCase {
	private function rendered( string $slug ): string {
		$a = ideatoapps_blog_parse_article( IDEATOAPPS_CORE_DIR . "content/articles/{$slug}.html" );
		$this->assertIsArray( $a );
		return (string) apply_filters( 'the_content', $a['body'] );
	}

	private function words( string $html ): int {
		return (int) preg_match_all( '/[\p{L}\p{N}]+/u', wp_strip_all_tags( $html ) );
	}

	/** Every teaser is whole top-level blocks: it splits back into closed blocks that join up to itself. */
	private function assertWholeBlocks( string $teaser ): void {
		$blocks = ideatoapps_reader_split_blocks( $teaser );
		foreach ( $blocks as $b ) {
			$this->assertTrue( $b['closed'], 'unclosed block in the teaser: ' . substr( $b['html'], 0, 80 ) );
		}
		$this->assertSame( $teaser, implode( '', array_column( $blocks, 'html' ) ) );
	}

	public function test_real_articles_08_and_14_cut_between_blocks_before_any_interactive_box(): void {
		foreach ( array( '08-your-first-week-with-ai', '14-reusable-prompt-templates' ) as $slug ) {
			$html   = $this->rendered( $slug );
			$teaser = ideatoapps_reader_teaser( $html );
			$this->assertNotSame( '', $teaser, $slug );
			$this->assertStringStartsWith( $teaser, ltrim( $html ), "{$slug}: the teaser is the start of the article, unchanged" );
			$this->assertWholeBlocks( $teaser );
			$n = $this->words( $teaser );
			$this->assertGreaterThanOrEqual( 40, $n, $slug );
			$this->assertLessThanOrEqual( IDEATOAPPS_READER_TEASER_MAX, $n, $slug );
			foreach ( array( 'ita-prompt', 'ita-quiz', 'ita-checklist', 'ita-why', '<details', '<table', '<pre', '[ita_', '<form' ) as $bad ) {
				$this->assertStringNotContainsString( $bad, $teaser, "{$slug}: {$bad}" );
			}
			$this->assertDoesNotMatchRegularExpression( '#<h[1-6][^>]*>(?:(?!</h).)*</h[1-6]>\s*$#is', $teaser, "{$slug}: does not end on a heading" );
		}
	}

	public function test_article_08_reaches_about_120_words_and_stops_before_its_checklist(): void {
		$teaser = ideatoapps_reader_teaser( $this->rendered( '08-your-first-week-with-ai' ) );
		$this->assertGreaterThanOrEqual( IDEATOAPPS_READER_TEASER_WORDS, $this->words( $teaser ) );
		$this->assertStringContainsString( 'Check them off as you read', html_entity_decode( $teaser ) );
		$this->assertStringNotContainsString( 'Never paste passwords', $teaser );
	}

	public function test_after_120_words_it_stops_at_the_next_heading(): void {
		$p    = '<p>' . str_repeat( 'word ', 70 ) . '</p>';
		$html = $p . "\n" . $p . "\n<p>Also shown.</p>\n<h2>Next part</h2>\n<p>SECRET after the heading.</p>";
		$t    = ideatoapps_reader_teaser( $html );
		$this->assertStringContainsString( 'Also shown.', $t );
		$this->assertStringNotContainsString( 'Next part', $t );
		$this->assertStringNotContainsString( 'SECRET', $t );
	}

	public function test_never_more_than_200_words_even_without_a_heading(): void {
		$html = str_repeat( '<p>' . str_repeat( 'word ', 60 ) . "</p>\n", 6 ) . '<p>SECRET</p>';
		$t    = ideatoapps_reader_teaser( $html );
		$this->assertLessThanOrEqual( IDEATOAPPS_READER_TEASER_MAX, $this->words( $t ) );
		$this->assertStringNotContainsString( 'SECRET', $t );
		$this->assertWholeBlocks( $t );
	}

	/** @return array<string, array{string}> Pathological bodies: each holds SECRET where a naive cut could reach it. */
	public static function pathological(): array {
		$intro = '<p>Opening words that are fine to show.</p>';
		return array(
			'prompt box first'          => array( '<div class="ita-prompt"><pre class="ita-prompt__text">SECRET prompt</pre></div>' . $intro ),
			'table early'               => array( $intro . '<table><tr><td>SECRET cell</td></tr></table><p>more</p>' ),
			'unclosed paragraph'        => array( $intro . '<p>SECRET never closed <em>at all' ),
			'unclosed div wraps rest'   => array( $intro . '<div class="wp-block-group"><p>SECRET inside a group</p>' ),
			'stray closing tags'        => array( '</div></p>' . $intro . '<div>SECRET</div>' ),
			'gt inside an attribute'    => array( '<p title="a > b">Shown text.</p><div data-x="<p>">SECRET</div>' ),
			'comment holding markup'    => array( $intro . '<!-- <p> --><details><summary>x</summary>SECRET</details>' ),
			'script and style'          => array( $intro . '<script>var a="</p><p>SECRET";</script><style>p{}</style>' ),
			'shortcode text left'       => array( $intro . '<p>[ita_quiz]</p><div class="ita-quiz">SECRET</div>' ),
			'nested lists'              => array( $intro . '<ul><li>a<ul><li>b</li></ul></li></ul><figure>SECRET</figure>' ),
			'one huge first paragraph'  => array( '<p>' . str_repeat( 'word ', 400 ) . 'SECRET</p>' ),
			'huge paragraph with markup' => array( '<p>' . str_repeat( 'word <b>bold</b> ', 200 ) . '<a href="#">SECRET</a></p>' ),
			'empty'                     => array( '' ),
			'only interactive'          => array( '<div class="ita-quiz">SECRET</div>' ),
		);
	}

	/** @dataProvider pathological */
	#[\PHPUnit\Framework\Attributes\DataProvider( 'pathological' )]
	public function test_pathological_bodies_never_leak_or_break_markup( string $html ): void {
		$t = ideatoapps_reader_teaser( $html );
		$this->assertStringNotContainsString( 'SECRET', $t );
		$this->assertWholeBlocks( $t );
		$this->assertStringNotContainsString( '<script', $t );
		$this->assertLessThanOrEqual( IDEATOAPPS_READER_TEASER_MAX, $this->words( $t ) );
	}

	public function test_a_huge_first_paragraph_becomes_plain_text_of_about_120_words(): void {
		$t = ideatoapps_reader_teaser( '<p>' . str_repeat( 'word <b>x</b> ', 300 ) . '</p>' );
		$this->assertStringStartsWith( '<p>', $t );
		$this->assertStringNotContainsString( '<b>', $t );
		$this->assertSame( IDEATOAPPS_READER_TEASER_WORDS, $this->words( $t ) );
	}

	public function test_interactive_boxes_at_the_start_are_skipped_and_later_prose_is_used(): void {
		$t = ideatoapps_reader_teaser( '<div class="ita-prompt">SECRET</div><p>Plain opening prose.</p><div class="ita-quiz">SECRET</div><p>Not reached.</p>' );
		$this->assertSame( '<p>Plain opening prose.</p>', $t );
	}
}
