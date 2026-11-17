<?php
use PHPUnit\Framework\TestCase;

/**
 * Prompt boxes keep each line's leading spaces and tabs (JSON and code-style prompts for builders) through the real the_content
 * pipeline. The copy button copies the <pre>'s textContent, so the escaped <pre> text decoded is exactly what a reader copies.
 */
final class BlogPromptIndentTest extends TestCase {
	private const SRC = "<p>Intro.</p>\n[ita_prompt title=\"Tool\"]\n(example values)\n{\n  \"name\": \"add_event\",\n  \"parameters\": {\n    \"type\": \"object\",\n\t\"note\": \"1 &lt; 2 &amp; 'yes'\"\n  }\n}\n\nThen check it.\n[/ita_prompt]\n\n<p>After.</p>";

	/** The text a reader sees and copies (textContent of the box's <pre>). */
	private static function copied( string $source ): string {
		$html = (string) apply_filters( 'the_content', $source );
		return preg_match( '#<pre class="ita-prompt__text">(.*?)</pre>#s', $html, $m ) ? html_entity_decode( $m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8' ) : 'NO BOX';
	}

	public function test_indented_json_keeps_its_indentation_blank_lines_and_tabs(): void {
		$want = "(example values)\n{\n  \"name\": \"add_event\",\n  \"parameters\": {\n    \"type\": \"object\",\n\t\"note\": \"1 < 2 & 'yes'\"\n  }\n}\n\nThen check it.";
		$this->assertSame( $want, self::copied( self::SRC ) );
	}

	public function test_special_characters_are_escaped_in_the_html(): void {
		$html = (string) apply_filters( 'the_content', self::SRC );
		preg_match( '#<pre class="ita-prompt__text">(.*?)</pre>#s', $html, $m );
		$this->assertStringContainsString( "\n    &quot;type&quot;: &quot;object&quot;,\n\t&quot;note&quot;: &quot;1 &lt; 2 &amp; &#039;yes&#039;&quot;", $m[1] );
		$this->assertStringNotContainsString( '<br', $m[1] );
		$this->assertStringNotContainsString( '<p', $m[1] );
	}

	public function test_first_line_indent_survives_and_outer_blank_lines_and_trailing_space_go(): void {
		$this->assertSame( "  indented first\nnext", self::copied( "[ita_prompt title=\"T\"]\n\n  indented first\nnext   \n\n[/ita_prompt]" ) );
		$this->assertSame( 'One line.', self::copied( '[ita_prompt title="T"]One line.[/ita_prompt]' ) );
	}

	public function test_the_helper_turns_autop_artefacts_into_newlines_without_eating_indentation(): void {
		$this->assertSame( "a\n  b\n\n\tc", ideatoapps_blog_multiline( "<br />\na<br />\n  b</p>\n<p>\tc<br />\n" ) );
	}

	/** A line right after a blank line starts a new wpautop paragraph (which wpautop trims); its indentation must still survive. */
	public function test_indentation_after_a_blank_line_inside_the_box_survives(): void {
		$this->assertSame( "{\n  \"a\": 1,\n\n  \"b\": 2\n}", self::copied( "<p>x</p>\n[ita_prompt title=\"T\"]\n{\n  \"a\": 1,\n\n  \"b\": 2\n}\n[/ita_prompt]\n\n<p>y</p>" ) );
	}

	public function test_indentation_outside_prompt_boxes_is_untouched(): void {
		$this->assertSame( "<p>a</p>\n  <p>b</p>", ideatoapps_blog_protect_indent( "<p>a</p>\n  <p>b</p>" ) );
		$this->assertSame( "[ita_prompt]\n&#32;&#32;x\n&#9;y[/ita_prompt]\n  z", ideatoapps_blog_protect_indent( "[ita_prompt]\n  x\n\ty[/ita_prompt]\n  z" ) );
	}

	public function test_the_box_keeps_white_space_when_shown(): void {
		$css = (string) file_get_contents( IDEATOAPPS_CORE_DIR . 'assets/blog.css' );
		$this->assertMatchesRegularExpression( '/\.ita-prompt__text\s*\{[^}]*white-space:\s*pre-wrap/', $css );
	}
}
