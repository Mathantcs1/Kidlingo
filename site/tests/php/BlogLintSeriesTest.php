<?php
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/helpers/blog-lint.php';
require_once __DIR__ . '/helpers/blog-lint-series.php';

/**
 * Series rules (helpers/blog-lint-series.php): quoted cross-references and per-article phrase budgets over the real articles, and a
 * self-test proving each rule can fail.
 */
final class BlogLintSeriesTest extends TestCase {
	/** @return array<string,array{prefix:string,title:string,text:string}> */
	private static function articles(): array {
		$out = array();
		foreach ( ideatoapps_blog_article_files() as $path ) {
			$a = ideatoapps_blog_parse_article( $path );
			if ( is_array( $a ) ) {
				$out[ $a['slug'] ] = array( 'prefix' => substr( $a['slug'], 0, 2 ), 'title' => (string) $a['title'], 'text' => ita_lint_visible_text( $a['body'] ) );
			}
		}
		return $out;
	}

	private static function titles(): array {
		$t = ideatoapps_blog_topics_data();
		$t = isset( $t['topics'] ) ? $t['topics'] : $t;
		return array_column( (array) $t, 'title', 'slug' );
	}

	public function test_every_article_quotes_its_cross_references(): void {
		$titles = self::titles();
		$this->assertCount( 50, $titles );
		$problems = array();
		foreach ( self::articles() as $slug => $a ) {
			$others = array_values( array_diff_key( $titles, array( $slug => true ) ) );
			$max    = in_array( $a['prefix'], ITA_LINT_XREF_MULTI, true ) ? 5 : 1;
			foreach ( ita_lint_cross_refs( $a['text'], $others, $max ) as $p ) {
				$problems[] = "{$slug}: {$p}";
			}
		}
		$this->assertSame( array(), $problems );
	}

	public function test_every_article_meets_the_phrase_budgets(): void {
		$allow    = ita_lint_series_allow();
		$problems = array();
		$openers  = 0;
		foreach ( self::articles() as $slug => $a ) {
			$openers += ita_lint_time_openers( $a['text'] );
			foreach ( ita_lint_budgets( $a['text'], $a['prefix'], $allow ) as $p ) {
				$problems[] = "{$slug}: {$p}";
			}
		}
		$this->assertSame( array(), $problems );
		$this->assertLessThanOrEqual( ITA_LINT_TIME_OPENERS_MAX, $openers, '"It\'s [time]" openers in the whole series' );
	}

	public function test_cross_reference_rule_can_fail(): void {
		$t = array( 'Context windows', 'How a chatbot "knows" things' );
		$this->assertSame( array(), ita_lint_cross_refs( 'Long chats lose details (see "Context windows").', $t ) );
		$this->assertSame( array(), ita_lint_cross_refs( 'Long files get cut (the article “Context windows” explains why).', $t ) );
		$this->assertSame( array(), ita_lint_cross_refs( 'Tone is not evidence (see "How a chatbot \'knows\' things").', $t ) );
		$this->assertNotEmpty( ita_lint_cross_refs( 'Context windows explains why.', $t ), 'bare title' );
		$this->assertNotEmpty( ita_lint_cross_refs( '"Context windows" covers this.', $t ), 'quoted title as the subject' );
		$this->assertNotEmpty( ita_lint_cross_refs( 'See "Context windows" and "How a chatbot "knows" things".', $t ), 'two cross-references' );
		$this->assertSame( array(), ita_lint_cross_refs( 'See "Context windows" and "How a chatbot "knows" things".', $t, 2 ) );
		$this->assertSame( array(), ita_lint_cross_refs( 'Long chats fill their context windows.', $t ), 'case-sensitive: a lowercase phrase is not a title' );
	}

	public function test_budget_rules_can_fail_and_the_allowlist_raises_a_limit(): void {
		$bad = array(
			'such-as'    => 'Fruit such as apples, such as pears, such as plums.',
			'hedges'     => 'It often works. It usually helps. Often true. Usually fine. Often again.',
			'differ'     => 'Rules differ between apps. Prices differ between shops.',
			'warmth'     => "If you've ever waited, fine. You've probably waited too.",
			'hypothesis' => 'Say you run a shop. Imagine a queue.',
			'same-pivot' => 'The same layout works at a care home.',
		);
		foreach ( $bad as $rule => $text ) {
			$this->assertCount( 1, ita_lint_budgets( $text ), $rule );
			$this->assertSame( array(), ita_lint_budgets( $text, '07', array( '07 ' . $rule => 5 ) ), $rule . ' allowlisted' );
		}
		$this->assertSame( array(), ita_lint_budgets( 'It happens more often now, and often enough. It usually works. Such a case is fine.' ) );
		$this->assertSame( array(), ita_lint_budgets( 'It often works, usually. Often. Usually. It\'s easy to start. Picture frames help.' ) );
		$this->assertSame( 2, ita_lint_time_openers( "It's Sunday evening, and you plan. Fine. It's 7 a.m. now. It's easy." ) );
	}
}
