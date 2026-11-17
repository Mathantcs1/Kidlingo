<?php
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/helpers/blog-lint-coverage.php';

/**
 * Reader coverage over content/topics.php (levels, audiences, per-category mix) and the matrix documented in the style guide,
 * plus self-tests on deliberately skewed topic lists proving each rule can fail.
 */
final class BlogCoverageLintTest extends TestCase {
	/** @return array<int, array<string, mixed>> */
	private static function topics(): array {
		$t = ideatoapps_blog_topics_data();
		return is_array( $t ) ? $t : array();
	}

	public function test_topics_json_meets_the_reader_coverage_targets(): void {
		$topics = self::topics();
		$this->assertCount( 50, $topics );
		$this->assertSame( array(), ita_lint_coverage( $topics ) );
	}

	public function test_the_style_guide_documents_the_current_matrix(): void {
		$guide = (string) file_get_contents( dirname( __DIR__, 2 ) . '/docs/BLOG_STYLE_GUIDE.md' );
		$this->assertStringContainsString( ita_coverage_markdown( self::topics() ), $guide, 'Update the matrix in BLOG_STYLE_GUIDE.md.' );
	}

	public function test_the_lint_lists_match_the_plugin_whitelists(): void {
		$this->assertSame( array_keys( ITA_COVERAGE_LEVEL_MIN ), IDEATOAPPS_BLOG_LEVELS );
		$this->assertSame( array_keys( ITA_COVERAGE_AUDIENCE_MIN ), IDEATOAPPS_BLOG_AUDIENCES );
	}

	/** A skewed list: every topic beginner, for beginners only. */
	public function test_a_skewed_fixture_fails(): void {
		$skewed = array_map( static fn( array $t ): array => array( 'level' => 'beginner', 'audiences' => array( 'beginners' ) ) + $t, self::topics() );
		$problems = implode( "\n", ita_lint_coverage( $skewed ) );
		$this->assertStringContainsString( 'Only 0 intermediate topics', $problems );
		$this->assertStringContainsString( 'Only 0 advanced topics', $problems );
		$this->assertStringContainsString( 'Only 0 topics for builders', $problems );
		$this->assertStringContainsString( 'Category agents has no intermediate topic.', $problems );
		$this->assertStringNotContainsString( 'beginner topics', $problems );
	}

	public function test_each_threshold_fails_one_below_its_minimum(): void {
		$topics = self::topics();
		foreach ( ITA_COVERAGE_LEVEL_MIN as $level => $min ) {
			$fixture = $this->with_level_count( $level, $min - 1 );
			$this->assertContains( 'Only ' . ( $min - 1 ) . " {$level} topics; at least {$min} needed.", ita_lint_coverage( $fixture ), $level );
			$this->assertNotContains( "Only {$min} {$level} topics; at least {$min} needed.", ita_lint_coverage( $this->with_level_count( $level, $min ) ), "{$level} at its minimum passes" );
		}
		foreach ( ITA_COVERAGE_AUDIENCE_MIN as $aud => $min ) {
			$fixture = array();
			$left    = $min - 1;
			foreach ( $topics as $t ) {
				$t['audiences'] = $left-- > 0 ? array( $aud ) : array( 'students' === $aud ? 'creators' : 'students' );
				$fixture[]      = $t;
			}
			$this->assertContains( 'Only ' . ( $min - 1 ) . " topics for {$aud}; at least {$min} needed.", ita_lint_coverage( $fixture ), $aud );
		}
	}

	/** Topics where exactly $n have $level and the rest another level (category coverage is not the point here). */
	private function with_level_count( string $level, int $n ): array {
		$other = 'beginner' === $level ? 'intermediate' : 'beginner';
		$out   = array();
		foreach ( self::topics() as $t ) {
			$t['level'] = $n-- > 0 ? $level : $other;
			$out[]      = $t;
		}
		return $out;
	}

	public function test_a_category_without_a_beginner_or_intermediate_topic_fails(): void {
		$fixture = array_map(
			static function ( array $t ): array {
				$t['level'] = 'llms' === $t['category'] ? 'advanced' : $t['level'];
				return $t;
			},
			self::topics()
		);
		$problems = ita_lint_coverage( $fixture );
		$this->assertContains( 'Category llms has no beginner topic.', $problems );
		$this->assertContains( 'Category llms has no intermediate topic.', $problems );
	}

	public function test_the_six_categories_come_from_the_theme(): void {
		$this->assertSame( array( 'ai-basics', 'prompting', 'llms', 'agents', 'work-and-learning', 'safety-and-judgment' ), ita_coverage_categories() );
		$five = array_slice( ita_coverage_categories(), 0, 5 );
		$this->assertContains( 'Expected the six topic categories from ideatoapps_blog_topics(), found 5.', ita_lint_coverage( self::topics(), $five ) );
		$seven = array_merge( ita_coverage_categories(), array( 'cooking' ) );
		$problems = ita_lint_coverage( self::topics(), $seven );
		$this->assertContains( 'Expected the six topic categories from ideatoapps_blog_topics(), found 7.', $problems );
		$this->assertContains( 'Category cooking has no beginner topic.', $problems, 'a listed category with no topics fails' );
	}

	/** A category with no topics at all (here: every safety topic moved elsewhere) fails, as does an unknown category. */
	public function test_a_category_with_no_topics_or_an_unknown_category_fails(): void {
		$fixture = array_map(
			static function ( array $t ): array {
				$t['category'] = 'safety-and-judgment' === $t['category'] ? 'work-and-learning' : $t['category'];
				return $t;
			},
			self::topics()
		);
		$problems = ita_lint_coverage( $fixture );
		$this->assertContains( 'Category safety-and-judgment has no beginner topic.', $problems );
		$this->assertContains( 'Category safety-and-judgment has no intermediate topic.', $problems );
		$fixture[0]['category'] = 'cooking';
		$this->assertContains( '01-what-ai-is-and-isnt: category is not one of the six topic categories.', ita_lint_coverage( $fixture ) );
	}

	public function test_bad_level_and_audience_values_fail(): void {
		$base = self::topics();
		$bad  = array(
			'unknown level'    => array( 'level' => 'expert' ),
			'level case'       => array( 'level' => 'Beginner' ),
			'no level'         => array( 'level' => null ),
			'no audiences'     => array( 'audiences' => array() ),
			'four audiences'   => array( 'audiences' => array( 'students', 'creators', 'builders', 'beginners' ) ),
			'duplicate'        => array( 'audiences' => array( 'students', 'students' ) ),
			'unknown audience' => array( 'audiences' => array( 'accessibility' ) ),
			'not a list'       => array( 'audiences' => 'students' ),
			'keyed'            => array( 'audiences' => array( 'a' => 'students' ) ),
		);
		foreach ( $bad as $name => $over ) {
			$fixture    = $base;
			$fixture[0] = $over + $fixture[0];
			$this->assertNotEmpty( preg_grep( '/^01-/', ita_lint_coverage( $fixture ) ), $name );
		}
	}
}
