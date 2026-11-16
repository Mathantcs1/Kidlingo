<?php
require_once __DIR__ . '/SeoTestCase.php';

/**
 * The interactive blog shortcodes: escaped valid markup, readable degradation for malformed input (never a PHP notice),
 * the no-JavaScript fallbacks, and where the assets load.
 */
final class BlogShortcodesTest extends SeoTestCase {
	protected function tearDown(): void {
		wp_dequeue_style( 'ita-blog' );
		wp_dequeue_script( 'ita-blog' );
		parent::tearDown();
	}

	/** Render and fail on any PHP notice, warning or deprecation (they must never reach a reader). */
	private function render( string $content ): string {
		$problems = array();
		set_error_handler(
			static function ( $no, $str ) use ( &$problems ) {
				$problems[] = $str;
				return true;
			}
		);
		try {
			$html = do_shortcode( $content );
		} finally {
			restore_error_handler();
		}
		$this->assertSame( array(), $problems, 'PHP notices while rendering: ' . $content );
		return $html;
	}

	/** Same, through the real content filters (wpautop and wptexturize run first on a real page). */
	private function render_post( string $content ): string {
		return apply_filters( 'the_content', $content );
	}

	private function dom( string $html ): DOMXPath {
		$doc = new DOMDocument();
		libxml_use_internal_errors( true );
		$doc->loadHTML( '<?xml encoding="utf-8"?><body>' . $html . '</body>' );
		libxml_clear_errors();
		return new DOMXPath( $doc );
	}

	public function test_all_shortcodes_are_registered(): void {
		foreach ( array( 'ita_prompt', 'ita_quiz', 'ita_q', 'ita_checklist', 'ita_item', 'ita_why', 'ita_term' ) as $tag ) {
			$this->assertTrue( shortcode_exists( $tag ), $tag );
		}
	}

	/* Prompt */

	public function test_prompt_renders_text_and_title_escaped(): void {
		$html = $this->render( '[ita_prompt title="Try <b>this</b> & \'that\'"]Summarise <script>alert(1)</script> "this" & that[/ita_prompt]' );
		$this->assertStringContainsString( 'data-testid="ita-prompt"', $html );
		$this->assertStringNotContainsString( '<script', $html );
		$this->assertStringNotContainsString( '<b>', $html );
		$this->assertStringContainsString( 'Summarise', $html );
		$this->assertStringContainsString( '&quot;this&quot; &amp; that', $html );
		$this->assertStringContainsString( 'Try this &amp; &#039;that&#039;', $html );
	}

	public function test_prompt_keeps_line_breaks_through_the_content_filters(): void {
		$html = $this->render_post( "[ita_prompt]Line one\nLine two\n\nLine three[/ita_prompt]" );
		$text = $this->dom( $html )->query( '//*[contains(@class,"ita-prompt__text")]' )->item( 0 )->textContent;
		$this->assertSame( "Line one\nLine two\n\nLine three", $text );
		$this->assertStringNotContainsString( '<br', $html );
		$this->assertStringNotContainsString( '&#8220;', $this->render_post( '[ita_prompt]Say "hi"[/ita_prompt]' ), 'prompt text is copied verbatim: no curly quotes' );
	}

	public function test_prompt_without_text_renders_nothing(): void {
		$this->assertSame( '', trim( $this->render( '[ita_prompt][/ita_prompt]' ) ) );
		$this->assertSame( '', trim( $this->render( '[ita_prompt title="x"]  <p> </p> [/ita_prompt]' ) ) );
	}

	public function test_prompt_has_a_default_title_and_the_text_without_script(): void {
		$html = $this->render( '[ita_prompt]Plain prompt[/ita_prompt]' );
		$this->assertStringContainsString( 'Plain prompt', $html );
		$this->assertMatchesRegularExpression( '/class="ita-prompt__title"[^>]*>[^<]+</', $html );
		$this->assertStringNotContainsString( '<button', $html, 'the copy button comes from JavaScript, so there is no dead button without it' );
	}

	/* Quiz */

	private function quiz(): string {
		return '[ita_quiz]'
			. '[ita_q q="What is 2 + 2?" answers="3|4|5" correct="2" why="Basic sums."]'
			. '[ita_q q="Capital of France?" answers="Paris|Rome" correct="1"]'
			. '[ita_q q="Pick a colour" answers="Red|Green|Blue" correct="3" why="Blue is right."]'
			. '[/ita_quiz]';
	}

	public function test_quiz_renders_three_questions_with_answers_visible_and_revealable_without_js(): void {
		$xp = $this->dom( $this->render( $this->quiz() ) );
		$this->assertSame( 1, $xp->query( '//*[@data-testid="ita-quiz"]' )->length );
		$this->assertSame( 3, $xp->query( '//*[@data-testid="ita-quiz"]//*[contains(@class,"ita-q")][@data-correct]' )->length );
		$this->assertSame( 8, $xp->query( '//*[contains(@class,"ita-q__options")]/li' )->length, 'every answer is listed as plain text' );
		$details = $xp->query( '//details[contains(@class,"ita-q__reveal")]' );
		$this->assertSame( 3, $details->length );
		$this->assertStringContainsString( '4', $details->item( 0 )->textContent );
		$this->assertStringContainsString( 'Basic sums.', $details->item( 0 )->textContent );
		$this->assertStringContainsString( 'Paris', $details->item( 1 )->textContent );
		$this->assertSame( '2', $xp->query( '//*[@data-correct]' )->item( 0 )->getAttribute( 'data-correct' ) );
		$this->assertSame( 0, $xp->query( '//input' )->length, 'radio buttons are built by JavaScript' );
	}

	public function test_quiz_escapes_question_answers_and_explanation(): void {
		$html = $this->render( '[ita_quiz][ita_q q="<img src=x onerror=alert(1)>Q & A?" answers="<script>x</script>|A & B" correct="2" why="<b onclick=1>why</b>"][/ita_quiz]' );
		$this->assertStringNotContainsString( '<img', $html );
		$this->assertStringNotContainsString( '<script', $html );
		$this->assertStringNotContainsString( 'onclick', $html );
		$this->assertStringContainsString( 'Q &amp; A?', $html );
		$this->assertStringContainsString( 'A &amp; B', $html );
	}

	public function test_question_with_missing_or_bad_correct_shows_answers_but_no_scoring(): void {
		foreach ( array( '', ' correct="0"', ' correct="9"', ' correct="abc"', ' correct="-1"' ) as $bad ) {
			$xp = $this->dom( $this->render( '[ita_quiz][ita_q q="Which?" answers="One|Two"' . $bad . '][/ita_quiz]' ) );
			$this->assertSame( 2, $xp->query( '//*[contains(@class,"ita-q__options")]/li' )->length, $bad );
			$this->assertSame( 0, $xp->query( '//*[@data-correct]' )->length, $bad );
			$this->assertSame( 0, $xp->query( '//details' )->length, $bad );
		}
	}

	public function test_question_without_text_or_answers_degrades_to_text(): void {
		$this->assertSame( '', trim( $this->render( '[ita_quiz][/ita_quiz]' ) ) );
		$this->assertSame( '', trim( $this->render( '[ita_quiz][ita_q][/ita_quiz]' ) ) );
		$html = $this->render( '[ita_quiz][ita_q q="Just a question"][/ita_quiz]' );
		$this->assertStringContainsString( 'Just a question', $html );
		$this->assertStringNotContainsString( 'data-correct', $html );
		$html = $this->render( '[ita_quiz]Loose <b>text</b> only[/ita_quiz]' );
		$this->assertStringContainsString( 'Loose text only', $html );
		$this->assertStringNotContainsString( '<b>', $html );
	}

	public function test_stray_question_outside_a_quiz_still_renders(): void {
		$html = $this->render( '[ita_q q="Alone?" answers="Yes|No" correct="1"]' );
		$this->assertStringContainsString( 'Alone?', $html );
		$this->assertStringContainsString( 'Yes', $html );
	}

	public function test_quiz_through_the_content_filters(): void {
		$html = $this->render_post( "<p>Intro</p>\n\n" . $this->quiz() . "\n\n<p>Outro</p>" );
		$xp   = $this->dom( $html );
		$this->assertSame( 3, $xp->query( '//*[@data-correct]' )->length );
		$this->assertSame( 3, $xp->query( '//details' )->length );
		$this->assertStringNotContainsString( '[ita_', $html );
	}

	/* Checklist */

	public function test_checklist_lists_items_and_sanitises_the_id(): void {
		$xp = $this->dom( $this->render( '[ita_checklist id="Week 1 <b>!"][ita_item]Open a chat[/ita_item][ita_item]Ask <i>one</i> question[/ita_item][/ita_checklist]' ) );
		$box = $xp->query( '//*[@data-testid="ita-checklist"]' );
		$this->assertSame( 1, $box->length );
		$this->assertMatchesRegularExpression( '/^[a-z0-9_-]+$/', $box->item( 0 )->getAttribute( 'data-ita-checklist' ) );
		$items = $xp->query( '//li[contains(@class,"ita-checklist__item")]' );
		$this->assertSame( 2, $items->length );
		$this->assertSame( 'Ask one question', trim( $items->item( 1 )->textContent ) );
	}

	public function test_checklist_without_id_gets_a_stable_one_and_empty_items_are_dropped(): void {
		$code = '[ita_checklist][ita_item]A[/ita_item][ita_item]  [/ita_item][ita_item]B[/ita_item][/ita_checklist]';
		$one  = $this->render( $code );
		$two  = $this->render( $code );
		$this->assertSame( 2, $this->dom( $one )->query( '//li' )->length );
		preg_match( '/data-ita-checklist="([^"]+)"/', $one, $a );
		preg_match( '/data-ita-checklist="([^"]+)"/', $two, $b );
		$this->assertNotEmpty( $a[1] );
		$this->assertSame( $a[1], $b[1] );
	}

	public function test_checklist_with_no_items_degrades_to_text_or_nothing(): void {
		$this->assertSame( '', trim( $this->render( '[ita_checklist id="x"][/ita_checklist]' ) ) );
		$html = $this->render( '[ita_checklist id="x"]Do the thing <u>soon</u>[/ita_checklist]' );
		$this->assertStringContainsString( 'Do the thing soon', $html );
		$this->assertStringNotContainsString( 'data-ita-checklist', $html );
	}

	public function test_checklist_through_the_content_filters(): void {
		$xp = $this->dom( $this->render_post( "[ita_checklist id=\"week\"]\n[ita_item]One[/ita_item]\n[ita_item]Two[/ita_item]\n[/ita_checklist]" ) );
		$this->assertSame( 2, $xp->query( '//li[contains(@class,"ita-checklist__item")]' )->length );
	}

	/* Why */

	public function test_why_is_a_native_details_block_with_limited_html(): void {
		$xp = $this->dom( $this->render( '[ita_why title="Why <i>so</i>?"]Because <strong>reasons</strong> <script>x()</script> <a href="javascript:alert(1)" onclick="y()">link</a>.[/ita_why]' ) );
		$this->assertSame( 1, $xp->query( '//details[@data-testid="ita-why"]' )->length );
		$this->assertSame( 'Why so?', trim( $xp->query( '//details/summary' )->item( 0 )->textContent ) );
		$body = $xp->query( '//*[contains(@class,"ita-why__body")]' )->item( 0 );
		$this->assertStringContainsString( 'reasons', $body->textContent );
		$this->assertSame( 1, $xp->query( '//strong' )->length );
		$this->assertSame( 0, $xp->query( '//script' )->length );
		$this->assertSame( 0, $xp->query( '//*[@onclick]' )->length );
		$this->assertSame( 0, $xp->query( '//a[starts-with(@href,"javascript")]' )->length );
	}

	public function test_why_defaults_its_title_and_renders_nothing_when_empty(): void {
		$this->assertStringContainsString( 'Why?', $this->render( '[ita_why]Short answer.[/ita_why]' ) );
		$this->assertSame( '', trim( $this->render( '[ita_why title="x"][/ita_why]' ) ) );
	}

	/* Term */

	public function test_term_has_a_no_js_definition_and_escapes_it(): void {
		$html = $this->render( "[ita_term define=\"A 'quoted' <b>thing</b> & more\"]token[/ita_term]" );
		$xp   = $this->dom( $html );
		$el   = $xp->query( '//abbr[@data-testid="ita-term"]' )->item( 0 );
		$this->assertNotNull( $el );
		$this->assertSame( 'token', $el->textContent );
		$this->assertSame( "A 'quoted' thing & more", $el->getAttribute( 'title' ) );
		$this->assertSame( '0', $el->getAttribute( 'tabindex' ) );
		$this->assertStringNotContainsString( '<b>', $html );
	}

	public function test_term_without_definition_or_word_degrades(): void {
		$html = $this->render( 'See [ita_term]plain word[/ita_term] and [ita_term define=""]other <b>word</b>[/ita_term] here' );
		$this->assertStringContainsString( 'plain word', $html );
		$this->assertStringContainsString( 'other word', $html );
		$this->assertStringNotContainsString( '<abbr', $html );
		$this->assertSame( '', trim( $this->render( '[ita_term define="x"][/ita_term]' ) ) );
	}

	public function test_a_bare_shortcode_without_closing_tag_does_not_notice(): void {
		foreach ( array( '[ita_prompt]', '[ita_quiz]', '[ita_checklist]', '[ita_item]', '[ita_why]', '[ita_term]', '[ita_term define="x"]', '[ita_q q="a" answers="b" correct="1"]' ) as $code ) {
			$this->render( $code );
		}
	}

	/* Review fixes */

	public function test_why_and_prompt_run_nested_shortcodes(): void {
		$xp = $this->dom( $this->render( '[ita_why title="T"]A [ita_term define="def"]word[/ita_term] inside.[/ita_why]' ) );
		$this->assertSame( 1, $xp->query( '//*[contains(@class,"ita-why__body")]//abbr[@title="def"]' )->length );
		$html = $this->render( '[ita_prompt]Explain [ita_term define="d"]tokens[/ita_term] simply[/ita_prompt]' );
		$this->assertStringContainsString( 'Explain tokens simply', $html );
		$this->assertStringNotContainsString( '[ita_term', $html );
	}

	public function test_malformed_nesting_degrades_safely(): void {
		$html = $this->render( '[ita_why]A [ita_term define="<script>x</script>"]x[/ita_why] and [ita_term define="d"]<script>y()</script>[/ita_term]' );
		$this->assertStringNotContainsString( '<script', $html );
		$this->assertStringContainsString( 'A ', $html );
		$html = $this->render( '[ita_why][ita_quiz][ita_q q="Q" answers="a|b" correct="1"][/ita_quiz] tail[/ita_why]' );
		$this->assertStringContainsString( 'tail', $html );
		$this->assertStringNotContainsString( '<details class="ita-q__reveal"', $html, 'block markup from nested components is filtered out' );
	}

	public function test_empty_answer_segments_leave_the_question_unscored(): void {
		foreach ( array( 'a||c', 'a|b|', '|a|b' ) as $answers ) {
			$xp = $this->dom( $this->render( '[ita_quiz][ita_q q="Q?" answers="' . $answers . '" correct="2"][/ita_quiz]' ) );
			$this->assertSame( 0, $xp->query( '//*[@data-correct]' )->length, $answers );
			$this->assertSame( 0, $xp->query( '//details' )->length, $answers );
			$this->assertGreaterThanOrEqual( 2, $xp->query( '//*[contains(@class,"ita-q__options")]/li' )->length, $answers );
		}
	}

	public function test_checklist_carries_a_hash_of_its_items(): void {
		$hash = function ( string $items ): string {
			preg_match( '/data-ita-hash="([^"]+)"/', $this->render( '[ita_checklist id="x"]' . $items . '[/ita_checklist]' ), $m );
			return $m[1] ?? '';
		};
		$a = $hash( '[ita_item]One[/ita_item][ita_item]Two[/ita_item]' );
		$this->assertNotSame( '', $a );
		$this->assertSame( $a, $hash( '[ita_item]One[/ita_item][ita_item]Two[/ita_item]' ) );
		$this->assertNotSame( $a, $hash( '[ita_item]Two[/ita_item][ita_item]One[/ita_item]' ), 'reordered' );
		$this->assertNotSame( $a, $hash( '[ita_item]One[/ita_item][ita_item]Too[/ita_item]' ), 'edited' );
	}

	/* Assets */

	public function test_assets_load_on_a_single_post_but_not_on_the_home_page_or_archives(): void {
		$id = self::factory_post( 'Plain post', 'No shortcodes here.' );
		$this->go_to( get_permalink( $id ) );
		do_action( 'wp_enqueue_scripts' );
		$this->assertTrue( wp_style_is( 'ita-blog', 'enqueued' ) );
		$this->assertTrue( wp_script_is( 'ita-blog', 'enqueued' ) );
		wp_dequeue_style( 'ita-blog' );
		wp_dequeue_script( 'ita-blog' );
		$this->go_to( home_url( '/' ) );
		do_action( 'wp_enqueue_scripts' );
		$this->assertFalse( wp_style_is( 'ita-blog', 'enqueued' ) );
		$this->assertFalse( wp_script_is( 'ita-blog', 'enqueued' ) );
	}

	public function test_assets_load_on_a_page_that_uses_a_shortcode_and_not_on_one_that_does_not(): void {
		$with    = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'With', 'post_content' => 'x [ita_term define="d"]w[/ita_term]' ) );
		$without = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Without', 'post_content' => 'nothing' ) );
		$this->go_to( get_permalink( $without ) );
		do_action( 'wp_enqueue_scripts' );
		$this->assertFalse( wp_style_is( 'ita-blog', 'enqueued' ) );
		$this->go_to( get_permalink( $with ) );
		do_action( 'wp_enqueue_scripts' );
		$this->assertTrue( wp_style_is( 'ita-blog', 'enqueued' ) );
	}

	private static function factory_post( string $title, string $content ): int {
		return wp_insert_post( array( 'post_status' => 'publish', 'post_title' => $title, 'post_content' => $content ) );
	}
}
