<?php
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/helpers/blog-lint-render.php';

/**
 * Render lint: every starter article through the real the_content filters gives clean HTML (see helpers/blog-lint-render.php),
 * plus self-tests proving each check fails on broken HTML or a broken source body.
 */
final class BlogRenderLintTest extends TestCase {
	public function test_every_article_renders_clean_html(): void {
		$files = ideatoapps_blog_article_files();
		$this->assertNotEmpty( $files );
		$all = array();
		foreach ( $files as $path ) {
			$a = ideatoapps_blog_parse_article( $path );
			if ( ! is_array( $a ) ) {
				$all[] = basename( $path ) . ': does not parse.';
				continue;
			}
			foreach ( ita_lint_render( $a['body'] ) as $problem ) {
				$all[] = basename( $path, '.html' ) . ': ' . $problem;
			}
		}
		$this->assertSame( array(), $all, "\n- " . implode( "\n- ", $all ) );
	}

	private const SRC = "<p>Intro.</p>\n[ita_prompt title=\"T\"]\nLine one.\nLine two.\n[/ita_prompt]\n\n<p>After.</p>";

	public function test_a_clean_body_passes(): void {
		$this->assertSame( array(), ita_lint_render( self::SRC ) );
	}

	/** @return array<string, array{string, string}> HTML broken in one way => expected problem text. */
	public static function broken_html(): array {
		$good = '<p>Intro.</p><div class="ita-prompt"><p class="ita-prompt__title">T</p><pre class="ita-prompt__text">Line one.' . "\n" . 'Line two.</pre></div><p>After.</p>';
		return array(
			'p wraps a div'      => array( str_replace( '<div class="ita-prompt">', '<p><div class="ita-prompt">', $good ), 'wraps a block' ),
			'p wraps a details'  => array( $good . '<p>Text <details><summary>x</summary>y</details></p>', 'wraps a block' ),
			'stray close'        => array( str_replace( '</div><p>After', '</div></p><p>After', $good ), 'Stray </p>' ),
			'stray in a box'     => array( $good . '<details><summary>W</summary><div class="ita-why__body"></p><p>w</p></div></details>', 'Stray </p>' ),
			'empty p'            => array( $good . '<p> </p>', 'Empty paragraph' ),
			'empty p with br'    => array( $good . '<p><br /></p>', 'Empty paragraph' ),
			'shortcode left'     => array( $good . '<p>[ita_why title="W"]</p>', 'Shortcode text' ),
			'closing left'       => array( $good . '<p>[/ita_prompt]</p>', 'Shortcode text' ),
			'br in prompt'       => array( str_replace( 'Line one.' . "\n", 'Line one.&lt;br /&gt;', $good ), 'has a <br>' ),
			'prompt lines lost'  => array( str_replace( 'Line one.' . "\n", 'Line one. ', $good ), 'different number of lines' ),
			'prompt missing'     => array( '<p>Intro.</p><p>After.</p>', 'prompt boxes in the source' ),
		);
	}

	#[\PHPUnit\Framework\Attributes\DataProvider( 'broken_html' )]
	public function test_each_check_fails_on_broken_html( string $html, string $expect ): void {
		$this->assertStringContainsString( $expect, implode( ' ', ita_lint_render( self::SRC, $html ) ) );
	}

	public function test_figure_and_quiz_checks_fail(): void {
		$fig = '[ita_figure name="agent-loop" alt="A loop."]';
		$this->assertSame( array(), ita_lint_render( $fig ) );
		$this->assertStringContainsString( 'renders an <svg>', implode( ' ', ita_lint_render( $fig, '<figure class="ita-figure"><figcaption>x</figcaption></figure>' ) ) );
		$this->assertStringContainsString( 'renders an <svg>', implode( ' ', ita_lint_render( '[ita_figure name="no-such-figure" alt="x"]' ) ), 'unknown figure renders nothing' );
		$q    = '[ita_q q="A?" answers="x|y" correct="1" why="W."]';
		$quiz = "[ita_quiz]\n{$q}\n{$q}\n{$q}\n[/ita_quiz]";
		$this->assertSame( array(), ita_lint_render( $quiz ) );
		$this->assertStringContainsString( 'renders 2 questions', implode( ' ', ita_lint_render( "[ita_quiz]\n{$q}\n{$q}\n[/ita_quiz]" ) ) );
		$this->assertStringContainsString( 'Not every quiz rendered', implode( ' ', ita_lint_render( $quiz, '<p>No quiz.</p>' ) ) );
	}

	/** The historic 05 markup ([/ita_why] then [ita_prompt] on the next line) is caught through the real pipeline. */
	public function test_the_real_pipeline_catches_the_historic_nesting_bug(): void {
		$body = "<p>Intro.</p>\n[ita_why title=\"W\"]\n<p>Why text.</p>\n[/ita_why]\n[ita_prompt title=\"T\"]\nExplain the term.\n[/ita_prompt]\n\n<p>After.</p>";
		$this->assertNotEmpty( ita_lint_render( $body ) );
		$this->assertSame( array(), ita_lint_render( str_replace( "[/ita_why]\n[ita_prompt", "[/ita_why]\n\n[ita_prompt", $body ) ) );
	}
}
