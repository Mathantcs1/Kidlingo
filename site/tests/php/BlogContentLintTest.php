<?php
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/helpers/blog-lint.php';
require_once __DIR__ . '/helpers/blog-lint-layout.php';

/**
 * Content lint for the starter articles (content/articles/*.php) against site/docs/BLOG_STYLE_GUIDE.md, plus a self-test proving
 * every rule can fail.
 */
final class BlogContentLintTest extends TestCase {
	private static function content_dir(): string {
		return rtrim( IDEATOAPPS_CORE_DIR, '/' ) . '/content';
	}

	/** Every file in the folder except the index.php stub: a stray or misnamed file is an error, not something to skip. */
	private static function files(): array {
		$dir = self::content_dir() . '/articles';
		return is_dir( $dir ) ? array_values( array_diff( scandir( $dir ) ?: array(), array( '.', '..', 'index.php' ) ) ) : array();
	}

	public function test_the_folder_has_articles_and_every_file_parses(): void {
		$files = self::files();
		$this->assertNotEmpty( $files, 'content/articles has no article files.' );
		foreach ( $files as $name ) {
			$path = self::content_dir() . '/articles/' . $name;
			$this->assertMatchesRegularExpression( '/\A\d\d-[a-z0-9]+(?:-[a-z0-9]+)*\.php\z/', $name, "{$name}: not an NN-slug.php file." );
			$this->assertContains( $path, ideatoapps_blog_article_files(), "{$name}: the installer would not see this file." );
			$a = ideatoapps_blog_parse_article( $path );
			$this->assertIsArray( $a, $name . ': ' . ( is_wp_error( $a ) ? $a->get_error_message() : '' ) );
			$this->assertSame( $a['slug'] . '.php', $name, "{$name}: file name must match the slug." );
		}
	}

	public function test_every_article_passes_the_lint(): void {
		$files = self::files();
		$this->assertNotEmpty( $files );
		foreach ( $files as $name ) {
			$path = self::content_dir() . '/articles/' . $name;
			$a    = ideatoapps_blog_parse_article( $path );
			if ( ! is_array( $a ) ) {
				$this->fail( "{$name} does not parse." );
			}
			$problems = ita_lint_article( $a, (string) file_get_contents( $path ), self::content_dir() );
			$this->assertSame( array(), $problems, $name . ":\n- " . implode( "\n- ", $problems ) );
		}
	}

	/* Self-test: a clean article body passes; each rule fails on a deliberately bad string. */

	private static function good_body(): string {
		$words = str_repeat( 'Plain words that a reader can follow without trouble today. ', 80 );
		return '<p>' . $words . '</p><h2>One</h2><p>Text.</p>'
			. '[ita_figure name="agent-loop" alt="A loop of steps." caption="The loop."]'
			. '<h2>Two</h2>[ita_prompt title="Try this"]Write a list.[/ita_prompt]' . "\n\n"
			. '[ita_why title="Why?"]<p>Because [ita_term define="A small piece of text."]tokens[/ita_term] add up.</p>[/ita_why]' . "\n\n"
			. '[ita_quiz][ita_q q="A?" answers="x|yy" correct="1" why="Because."][ita_q q="B?" answers="x|y|z" correct="3" why="Because."]'
			. '[ita_q q="C?" answers="x|y" correct="2" why="Because."][/ita_quiz]' . "\n\n" . '<h2>Try it</h2><p>Do this.</p>';
	}

	public function test_lint_accepts_a_clean_body(): void {
		$a = array( 'slug' => '01-what-ai-is-and-isnt', 'level' => 'beginner', 'excerpt' => 'Short.', 'check' => array( 'a', 'b', 'c' ), 'body' => self::good_body() );
		$this->assertSame( array(), ita_lint_article( $a, self::good_body(), self::content_dir() ) );
	}

	public function test_visible_text_keeps_prompt_quiz_and_checklist_text_and_drops_markup(): void {
		$t = ita_lint_visible_text( '<p>Hello <strong>there</strong></p>[ita_prompt title="T"]Copy me[/ita_prompt][ita_checklist id="c"][ita_item]Tick me[/ita_item][/ita_checklist][ita_quiz][ita_q q="Ask" answers="one|two" correct="1" why="Reason"][/ita_quiz]' );
		$this->assertSame( 'Hello there Copy me Tick me Ask one two Reason', $t );
		$this->assertSame( 4, ita_lint_word_count( "It's a well-known fact." ) );
	}

	public function test_each_structure_rule_can_fail(): void {
		$good = self::good_body();
		$this->assertNotEmpty( ita_lint_length( '<p>Too short.</p>' ) );
		$this->assertNotEmpty( ita_lint_length( '<p>' . str_repeat( 'word ', 1301 ) . '</p>' ) );
		$this->assertNotEmpty( ita_lint_shortcodes( '[ita_unknown]x[/ita_unknown]' ) );
		$this->assertNotEmpty( ita_lint_shortcodes( '[ita_prompt]never closed' ) );
		$this->assertNotEmpty( ita_lint_quiz( str_replace( '[ita_quiz]', '', $good ) ), 'no quiz' );
		$this->assertNotEmpty( ita_lint_quiz( $good . '[ita_quiz][ita_q q="D?" answers="x|y" correct="1" why="W"][/ita_quiz]' ), 'two quizzes' );
		$this->assertNotEmpty( ita_lint_quiz( preg_replace( '/\[ita_q q="C\?"[^\]]*\]/', '', $good ) ), 'two questions' );
		$this->assertNotEmpty( ita_lint_quiz( str_replace( 'correct="3"', 'correct="4"', $good ) ), 'correct out of range' );
		$this->assertNotEmpty( ita_lint_quiz( str_replace( 'correct="3"', 'correct="0"', $good ) ), 'correct zero' );
		$this->assertNotEmpty( ita_lint_quiz( preg_replace( '/ why="Because\."/', '', $good, 1 ) ), 'missing why' );
		$this->assertNotEmpty( ita_lint_quiz( str_replace( 'answers="x|y|z"', 'answers="x||z"', $good ) ), 'empty answer' );
		$this->assertNotEmpty( ita_lint_interactive( '<p>Just text.</p>' ) );
		$this->assertSame( array(), ita_lint_interactive( '[ita_checklist id="a"][ita_item]x[/ita_item][/ita_checklist]' ) );
		$this->assertNotEmpty( ita_lint_headings( '<h2>A</h2><h2>B</h2><h2>C</h2><h2>Try it now</h2>' ), 'last h2 not Try it' );
		$this->assertNotEmpty( ita_lint_headings( '<h2>A</h2><h2>Try it</h2>' ), 'too few' );
		$this->assertNotEmpty( ita_lint_headings( str_repeat( '<h2>A</h2>', 5 ) . '<h2>Try it</h2>' ), 'too many' );
		$this->assertSame( array(), ita_lint_headings( '<h2>A</h2><h2>B</h2><h2 id="x">Try it</h2>' ) );
		$dir = self::content_dir() . '/figures';
		$this->assertNotEmpty( ita_lint_figures( '[ita_figure name="no-such-figure" alt="x"]', $dir ) );
		$this->assertNotEmpty( ita_lint_figures( '[ita_figure name="agent-loop" alt="' . str_repeat( 'x', 141 ) . '"]', $dir ) );
		$this->assertNotEmpty( ita_lint_figures( '[ita_figure name="agent-loop"]', $dir ) );
		$this->assertNotEmpty( ita_lint_figures( str_repeat( '[ita_figure name="agent-loop" alt="x"]', 4 ), $dir ) );
		$this->assertSame( array(), ita_lint_figures( '[ita_figure name="agent-loop" alt="x"]', $dir ) );
	}

	public function test_article_level_rules_can_fail(): void {
		$a = array( 'slug' => '99-no-such-hero', 'excerpt' => str_repeat( 'x', 161 ), 'check' => array( 'a', 'b' ), 'body' => self::good_body() );
		$problems = implode( ' ', ita_lint_article( $a, self::good_body(), self::content_dir() ) );
		$this->assertStringContainsString( 'No hero file', $problems );
		$this->assertStringContainsString( 'Excerpt', $problems );
		$this->assertStringContainsString( 'check needs', $problems );
	}

	/** @return array<string, array{string, string}> */
	public static function bad_text(): array {
		return array(
			'email'           => array( 'ita_lint_emails', 'Write to someone@example.com today.' ),
			'https link'      => array( 'ita_lint_links', 'See https://example.org for more.' ),
			'http link'       => array( 'ita_lint_links', 'See http://example.org for more.' ),
			'href'            => array( 'ita_lint_links', '<a href="/x">x</a>' ),
			'www'             => array( 'ita_lint_links', 'Visit www.example.org.' ),
			'my experience'   => array( 'ita_lint_first_person', 'In my experience it works.' ),
			'I tested'        => array( 'ita_lint_first_person', 'I tested three tools.' ),
			'we tested'       => array( 'ita_lint_first_person', 'We tested it last week.' ),
			'I tried'         => array( 'ita_lint_first_person', 'I tried that once.' ),
			"I've used"       => array( 'ita_lint_first_person', "I've used it daily." ),
			'curly ve'        => array( 'ita_lint_first_person', "I\u{2019}ve used it daily." ),
			'our users'       => array( 'ita_lint_first_person', 'Our users love it.' ),
			'our customers'   => array( 'ita_lint_first_person', 'Our customers agree.' ),
			'I asked'         => array( 'ita_lint_first_person', 'I asked a chatbot.' ),
			'when I'          => array( 'ita_lint_first_person', 'When I write prompts, I add context.' ),
			'dollar sign'     => array( 'ita_lint_currency', 'It costs $20.' ),
			'euro sign'       => array( 'ita_lint_currency', 'It costs 20 €.' ),
			'pound sign'      => array( 'ita_lint_currency', 'It costs £5.' ),
			'USD'             => array( 'ita_lint_currency', 'About 20 USD.' ),
			'dollars'         => array( 'ita_lint_currency', 'Twenty dollars a month.' ),
			'euros'           => array( 'ita_lint_currency', 'Ten euros.' ),
			'GPT-4'           => array( 'ita_lint_versions', 'GPT-4 can do it.' ),
			'GPT-5'           => array( 'ita_lint_versions', 'Try GPT-5.' ),
			'GPT-4o'          => array( 'ita_lint_versions', 'Try GPT-4o.' ),
			'Claude 3'        => array( 'ita_lint_versions', 'Claude 3 Opus is good.' ),
			'Claude 3.5'      => array( 'ita_lint_versions', 'Claude 3.5 Sonnet.' ),
			'Gemini 2'        => array( 'ita_lint_versions', 'Gemini 2 Pro.' ),
			'Llama 3'         => array( 'ita_lint_versions', 'Llama 3 runs locally.' ),
			'Llama-3.1'       => array( 'ita_lint_versions', 'Llama-3.1 runs locally.' ),
			'Mistral 7B'      => array( 'ita_lint_versions', 'Mistral 7B is small.' ),
			'o1'              => array( 'ita_lint_versions', 'The o1 model thinks.' ),
			'fast-paced'      => array( 'ita_lint_filler', "In today's fast-paced world, AI matters." ),
			'delve'           => array( 'ita_lint_filler', "Let's delve into it." ),
			'unlock'          => array( 'ita_lint_filler', 'Unlock your potential.' ),
			'game-changer'    => array( 'ita_lint_filler', 'It is a game-changer.' ),
			'revolutionize'   => array( 'ita_lint_filler', 'It will revolutionize work.' ),
			'important note'  => array( 'ita_lint_filler', "It's important to note that." ),
			'as an AI'        => array( 'ita_lint_filler', 'As an AI, I cannot.' ),
			'the best'        => array( 'ita_lint_superlatives', 'This is the best model.' ),
			'state of art'    => array( 'ita_lint_superlatives', 'A state-of-the-art system.' ),
			'cutting-edge'    => array( 'ita_lint_superlatives', 'Cutting-edge tools.' ),
			'world-class'     => array( 'ita_lint_superlatives', 'World-class results.' ),
			'revolutionary'   => array( 'ita_lint_superlatives', 'A revolutionary idea.' ),
			'industry-leading' => array( 'ita_lint_superlatives', 'An industry-leading tool.' ),
		);
	}

	#[\PHPUnit\Framework\Attributes\DataProvider( 'bad_text' )]
	public function test_each_text_rule_flags_bad_text( string $rule, string $text ): void {
		$this->assertNotEmpty( $rule( $text ), "{$rule} missed: {$text}" );
		$this->assertNotEmpty( ita_lint_text_rules( $text ) );
	}

	public function test_text_rules_leave_ordinary_sentences_alone(): void {
		$ok = 'You can ask a chatbot for a percent, a recipe or a plan. When you write a prompt, add context. Phase 2 of a project. '
			. 'A model named Claude or Gemini is a product, and a sonnet is a poem. I want a short list. Check the answer for errors.';
		$this->assertSame( array(), ita_lint_text_rules( $ok ) );
	}

	public function test_block_spacing_rule_can_fail(): void {
		$ok = "<p>A</p>\n[ita_prompt title=\"T\"]x[/ita_prompt]\n<p>B</p>\n[ita_checklist id=\"c\"][ita_item]y[/ita_item][/ita_checklist]\n\n[ita_quiz][/ita_quiz]\n<h2>Try it</h2>";
		$this->assertSame( array(), ita_lint_block_spacing( $ok ), 'a paragraph or heading right after a box is fine' );
		$this->assertSame( array(), ita_lint_block_spacing( "[ita_why title=\"W\"]w[/ita_why]\n\n[ita_prompt title=\"T\"]x[/ita_prompt]" ), 'blank line' );
		foreach ( array(
			'05 (why then prompt)'   => "<p>Some terms are argued about.</p>\n[/ita_why]\n[ita_prompt title=\"Explain a new AI word\"]\nExplain the term.\n[/ita_prompt]",
			'20 (prompt then why)'   => "Summarize this.\n[/ita_prompt]\n[ita_why title=\"What does a summary lose?\"]<p>x</p>[/ita_why]",
			'checklist then quiz'    => "[ita_checklist id=\"c\"][ita_item]a[/ita_item][/ita_checklist]\n[ita_quiz][/ita_quiz]",
			'quiz then figure'       => "[ita_quiz][/ita_quiz]  \n  [ita_figure name=\"agent-loop\" alt=\"x\"]",
		) as $name => $bad ) {
			$this->assertNotEmpty( ita_lint_block_spacing( $bad ), $name );
		}
		$this->assertStringContainsString( 'Line 2', implode( ' ', ita_lint_block_spacing( "<p>a</p>\n[ita_prompt]x[/ita_prompt]\n[ita_why title=\"W\"]w[/ita_why]" ) ) );
	}

	public function test_table_rule_can_fail(): void {
		$ok = '<table><caption>Formats</caption><thead><tr><th scope="col">A</th><th scope="col">B</th></tr></thead><tbody><tr><th scope="row">R</th><td>1</td></tr></tbody></table>';
		$this->assertSame( array(), ita_lint_tables( $ok ) );
		$this->assertSame( array(), ita_lint_tables( '<p>No table.</p>' ) );
		$this->assertNotEmpty( ita_lint_tables( str_replace( '<caption>Formats</caption>', '', $ok ) ), 'no caption' );
		$this->assertNotEmpty( ita_lint_tables( str_replace( '<caption>Formats</caption>', '<caption> </caption>', $ok ) ), 'empty caption' );
		$this->assertNotEmpty( ita_lint_tables( str_replace( '<th scope="row">', '<th>', $ok ) ), 'row header without scope' );
		$this->assertNotEmpty( ita_lint_tables( str_replace( '<th scope="col">B', '<th class="x">B', $ok ) ), 'column header without scope' );
		$this->assertNotEmpty( ita_lint_tables( str_replace( 'scope="col">A', 'scope="wide">A', $ok ) ), 'unknown scope' );
		$this->assertNotEmpty( ita_lint_tables( $ok . '<table><tr><td>x</td></tr></table>' ), 'second table without caption' );
	}

	public function test_commentary_after_a_prompt_box_can_fail(): void {
		$box = '[ita_prompt title="T"]Write a list.[/ita_prompt]' . "\n\n";
		$this->assertSame( array(), ita_lint_after_prompt( $box . '<p>Paste it into the app. The last step is yours.</p>' ), 'only the first sentence counts' );
		$this->assertSame( array(), ita_lint_after_prompt( $box . '[ita_why title="W"]<p>Notice this.</p>[/ita_why]' ), 'a why box is not a sentence about the prompt' );
		foreach ( array( 'The last line sets the format.', 'Notice how the context comes first.', 'That line about length matters.', 'The format request matters more than it looks.', 'Those two words do a lot of work.', 'The example does a lot of work here.', 'notice the order.' ) as $bad ) {
			$this->assertNotEmpty( ita_lint_after_prompt( $box . "<p>{$bad} More text.</p>" ), $bad );
		}
	}

	public function test_layout_lints_are_part_of_the_article_lint(): void {
		$a = array( 'slug' => '01-what-ai-is-and-isnt', 'level' => 'beginner', 'excerpt' => 'Short.', 'check' => array( 'a', 'b', 'c' ), 'body' => '' );
		$a['body'] = str_replace( "[/ita_prompt]\n\n", "[/ita_prompt]\n<p>Notice the list.</p>\n\n", self::good_body() );
		$problems  = implode( ' ', ita_lint_article( $a, $a['body'], self::content_dir() ) );
		$this->assertStringContainsString( 'comments on the box', $problems );
		$a['body'] = str_replace( "[/ita_prompt]\n\n", "[/ita_prompt]\n", self::good_body() );
		$problems  = implode( ' ', ita_lint_article( $a, $a['body'], self::content_dir() ) );
		$this->assertStringContainsString( 'followed on the next line by another shortcode', $problems );
	}
}
