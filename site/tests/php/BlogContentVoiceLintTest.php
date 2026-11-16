<?php
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/helpers/blog-lint.php';

/**
 * Voice, quiz-variety and spelling rules of the content lint (helpers/blog-lint-voice.php): the cross-article quiz check over the real
 * articles, and a self-test proving each rule can fail.
 */
final class BlogContentVoiceLintTest extends TestCase {
	public function test_correct_answer_positions_are_spread_across_all_articles(): void {
		$positions = array();
		foreach ( ideatoapps_blog_article_files() as $path ) {
			$a = ideatoapps_blog_parse_article( $path );
			if ( is_array( $a ) ) {
				$positions = array_merge( $positions, array_column( ita_lint_quiz_questions( $a['body'] ), 'correct' ) );
			}
		}
		$this->assertNotEmpty( $positions );
		$this->assertSame( array(), ita_lint_quiz_distribution( $positions ) );
	}

	private static function quiz( string ...$qs ): string {
		return '[ita_quiz]' . implode( '', $qs ) . '[/ita_quiz]';
	}

	public function test_quiz_variety_can_fail(): void {
		$same = self::quiz( '[ita_q q="A" answers="aa|b" correct="2" why="w"]', '[ita_q q="B" answers="aa|b" correct="2" why="w"]', '[ita_q q="C" answers="aa|b" correct="2" why="w"]' );
		$this->assertSame( array( 'Every quiz answer is in the same position.' ), ita_lint_quiz_variety( $same ) );
		$long = self::quiz( '[ita_q q="A" answers="long one|b" correct="1" why="w"]', '[ita_q q="B" answers="a|long one" correct="2" why="w"]', '[ita_q q="C" answers="a|b|long one" correct="3" why="w"]' );
		$this->assertSame( array( 'The correct answer is the longest option in every question.' ), ita_lint_quiz_variety( $long ) );
		$ok = self::quiz( '[ita_q q="A" answers="long one|b" correct="1" why="w"]', '[ita_q q="B" answers="long one|b" correct="2" why="w"]', '[ita_q q="C" answers="a|b|long one" correct="3" why="w"]' );
		$this->assertSame( array(), ita_lint_quiz_variety( $ok ) );
	}

	public function test_quiz_distribution_can_fail(): void {
		$this->assertNotEmpty( ita_lint_quiz_distribution( array( 2, 2, 2, 2, 1, 3 ) ), 'four of six in position 2' );
		$this->assertNotEmpty( ita_lint_quiz_distribution( array( 2, 2, 2, 2, 2, 1, 3, 1, 3 ) ), 'five of nine' );
		$this->assertSame( array(), ita_lint_quiz_distribution( array( 2, 2, 2, 1, 3, 1 ) ), 'exactly half is allowed' );
		$this->assertSame( array(), ita_lint_quiz_distribution( array( 2, 2, 2 ) ), 'fewer than six questions are not judged' );
	}

	public function test_voice_rule_can_fail(): void {
		$thats = '<p>That\'s one. Fine. That\'s two.</p><p>That&#8217;s three.</p>';
		$this->assertNotEmpty( ita_lint_voice( $thats ) );
		$this->assertSame( array(), ita_lint_voice( '<p>That\'s one. That\'s two. And that\'s fine mid-sentence.</p>' ) );
		$nots = '<p>A goal, not a list. A tool, not the app. A draft, not your final copy.</p>';
		$this->assertNotEmpty( ita_lint_voice( $nots ) );
		$this->assertSame( array(), ita_lint_voice( '<p>A goal, not a list. A tool, not the app. Often true, but not always.</p>' ) );
	}

	public function test_spelling_rule_can_fail(): void {
		foreach ( array( 'summarise', 'Summarising', 'colour', 'a flat', 'revise', 'organise', 'behaviour', 'favourite', 'recognising', 'judgement', 'neighbour', 'analyse', 'centre', 'travelling' ) as $word ) {
			$this->assertNotEmpty( ita_lint_spelling( "Please {$word} this." ), $word );
		}
		$this->assertSame( array(), ita_lint_spelling( 'Summarize the color of the apartment; analysis and behavior are fine; flatten it.' ) );
	}

	public function test_prompt_term_rule_can_fail(): void {
		$term = '[ita_term define="The message you type to an AI app."]prompt[/ita_term]';
		$this->assertSame( array(), ita_lint_prompt_term( '<p>No such word here.</p>[ita_prompt title="Try this"]x[/ita_prompt]' ) );
		$this->assertSame( array(), ita_lint_prompt_term( '<p>A good ' . $term . ' and another prompt.</p>' ) );
		$this->assertNotEmpty( ita_lint_prompt_term( '<p>A prompt first, then a ' . $term . '.</p>' ) );
		$this->assertNotEmpty( ita_lint_prompt_term( '[ita_figure name="x" alt="Parts of a prompt"]<p>' . $term . '</p>' ) );
		$this->assertNotEmpty( ita_lint_prompt_term( '<p>Prompts matter.</p>' ) );
	}
}
