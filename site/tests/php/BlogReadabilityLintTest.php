<?php
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/helpers/blog-lint.php';

/**
 * Readability lint: the documented Flesch reading ease formula, syllable heuristic and text extraction, the per-level thresholds,
 * and every starter article at or above its level's minimum.
 */
final class BlogReadabilityLintTest extends TestCase {
	/** @return array<string, array{string, int}> */
	public static function syllable_words(): array {
		return array(
			'short'          => array( 'cat', 1 ),
			'silent e'       => array( 'make', 1 ),
			'consonant le'   => array( 'table', 2 ),
			'vowel groups'   => array( 'beautiful', 3 ),
			'plain'          => array( 'hello', 2 ),
			'ed dropped'     => array( 'jumped', 1 ),
			'ed after t'     => array( 'wanted', 2 ),
			'es dropped'     => array( 'takes', 1 ),
			'es after x'     => array( 'boxes', 2 ),
			'y as vowel'     => array( 'system', 2 ),
			'hyphenated'     => array( 'well-known', 2 ),
			'apostrophe'     => array( "isn't", 1 ),
			'capitals'       => array( 'Computer', 3 ),
			'digits'         => array( '2026', 1 ),
			'long'           => array( 'information', 4 ),
			// Follow-up fixes, hand-counted.
			'AI'             => array( 'AI', 2 ),
			"AI's"           => array( "AI's", 2 ),
			'consonant les'  => array( 'tables', 2 ),
			'variables'      => array( 'variables', 4 ),
			'examples'       => array( 'examples', 3 ),
			'idea'           => array( 'idea', 3 ),
			'area'           => array( 'area', 3 ),
			'create'         => array( 'create', 2 ),
			'science'        => array( 'science', 2 ),
			'being'          => array( 'being', 2 ),
			'seeing'         => array( 'seeing', 2 ),
			'going'          => array( 'going', 2 ),
			'quiet'          => array( 'quiet', 2 ),
			'client'         => array( 'client', 2 ),
			'experience'     => array( 'experience', 4 ),
			'video'          => array( 'video', 3 ),
			'radio'          => array( 'radio', 3 ),
			'diagram'        => array( 'diagram', 3 ),
			'actual'         => array( 'actual', 3 ),
			'various'        => array( 'various', 3 ),
			'theory'         => array( 'theory', 3 ),
			// ...without over-counting these.
			'something'      => array( 'something', 2 ),
			'every'          => array( 'every', 2 ),
			'business'       => array( 'business', 2 ),
			'people'         => array( 'people', 2 ),
			'nation (tion)'  => array( 'nation', 2 ),
			'special (cial)' => array( 'special', 2 ),
			'question (qu)'  => array( 'question', 2 ),
			'language (gu)'  => array( 'language', 2 ),
			'friend (ie)'    => array( 'friend', 1 ),
			'patient (tie)'  => array( 'patient', 2 ),
			'studies'        => array( 'studies', 2 ),
		);
	}

	#[\PHPUnit\Framework\Attributes\DataProvider( 'syllable_words' )]
	public function test_syllable_heuristic( string $word, int $n ): void {
		$this->assertSame( $n, ita_syllables( $word ) );
	}

	public function test_flesch_formula_on_a_known_sentence(): void {
		$r = ita_readability( '<p>The cat sat on the mat.</p>' );
		$this->assertSame( array( 'words' => 6, 'sentences' => 1, 'syllables' => 6, 'score' => 116.1 ), $r ); // 206.835 - 1.015*6 - 84.6*1
		$r = ita_readability( '<p>The cat sat. The dog ran!</p>' );
		$this->assertSame( 2, $r['sentences'] );
	}

	public function test_blocks_strip_tags_and_shortcode_markup_and_keep_what_readers_see(): void {
		$body = '<h2>Heading words</h2><p>A <strong>bold</strong> [ita_term define="Text you type."]prompt[/ita_term] here.</p>'
			. '[ita_prompt title="Box title"]Copy this text.[/ita_prompt][ita_figure name="x" alt="Alt is not read." caption="A caption."]'
			. '[ita_quiz][ita_q q="Which one?" answers="First|Second" correct="1" why="Because."][/ita_quiz]<!-- hidden note -->';
		$this->assertSame( array( 'Heading words', 'A bold prompt here.', 'Copy this text.', 'A caption.', 'Which one?', 'First', 'Second', 'Because.' ), ita_readability_blocks( $body ) );
		$this->assertSame( 8, ita_readability( $body )['sentences'], 'a heading or answer without a full stop still ends a sentence' );
	}

	public function test_thresholds_per_level(): void {
		$this->assertSame( array( 'beginner' => 60, 'intermediate' => 50, 'advanced' => 40 ), ITA_READABILITY_MIN );
		$easy = '<p>' . str_repeat( 'You can ask a short question and get a plain answer. ', 20 ) . '</p>';
		$hard = '<p>' . str_repeat( 'Contemporary computational architectures necessitate sophisticated organizational methodologies, considerable experimentation and continuous evaluation. ', 20 ) . '</p>';
		foreach ( array( 'beginner', 'intermediate', 'advanced' ) as $level ) {
			$this->assertSame( array(), ita_lint_readability( $easy, $level ), $level );
			$this->assertNotEmpty( ita_lint_readability( $hard, $level ), $level );
		}
		$this->assertNotEmpty( ita_lint_readability( $easy, 'expert' ), 'unknown level' );
	}

	/** A body scoring between 50 and 60 passes intermediate and fails beginner: the levels really differ. */
	public function test_a_middling_text_passes_intermediate_but_not_beginner(): void {
		$mid = '<p>' . str_repeat( 'A language model predicts the next word using patterns from its training examples. ', 20 ) . '</p>';
		$s   = ita_readability( $mid )['score'];
		$this->assertGreaterThanOrEqual( 50, $s );
		$this->assertLessThan( 60, $s );
		$this->assertNotEmpty( ita_lint_readability( $mid, 'beginner' ) );
		$this->assertSame( array(), ita_lint_readability( $mid, 'intermediate' ) );
	}

	public function test_every_starter_article_meets_its_level(): void {
		$files = ideatoapps_blog_article_files();
		$this->assertNotEmpty( $files );
		foreach ( $files as $path ) {
			$a = ideatoapps_blog_parse_article( $path );
			$this->assertIsArray( $a, basename( $path ) );
			$this->assertSame( array(), ita_lint_readability( $a['body'], $a['level'] ), basename( $path ) . ' (' . ita_readability( $a['body'] )['score'] . ')' );
		}
	}
}
