<?php
/**
 * Reader-coverage lint over content/topics.php (Task 5b): every topic has a level and 1-3 audiences from the fixed lists, and the
 * 50 topics together meet the target mix. It reads topics.php, not the article files, so it holds before all articles exist.
 * Used by BlogCoverageLintTest; not shipped in the plugin.
 */

/** Minimum number of topics per level. */
const ITA_COVERAGE_LEVEL_MIN = array( 'beginner' => 22, 'intermediate' => 14, 'advanced' => 6 );

/** Minimum number of topics per audience. */
const ITA_COVERAGE_AUDIENCE_MIN = array(
	'beginners'                   => 20,
	'students'                    => 8,
	'teachers-and-tutors'         => 4,
	'parents-and-families'        => 3,
	'workers-and-business-owners' => 8,
	'creators'                    => 4,
	'builders'                    => 10,
);

/** Levels every category needs at least one topic of. */
const ITA_COVERAGE_PER_CATEGORY = array( 'beginner', 'intermediate' );

/**
 * The six topic categories, from the theme (ideatoapps_blog_topics()), in their fixed order.
 *
 * @return string[]
 */
function ita_coverage_categories(): array {
	return function_exists( 'ideatoapps_blog_topics' ) ? ideatoapps_blog_topics() : array();
}

/**
 * Counts per level, per audience and per category x level. Every one of the six categories gets a row, even with no topics;
 * a topic in any other category gets its own row after them.
 *
 * @param array<int, array<string, mixed>> $topics Topics as in topics.php.
 * @param string[]|null                    $cats   Category slugs; default the theme's six.
 * @return array{level: array<string,int>, audience: array<string,int>, category: array<string, array<string,int>>}
 */
function ita_coverage_counts( array $topics, ?array $cats = null ): array {
	$out = array(
		'level'    => array_fill_keys( array_keys( ITA_COVERAGE_LEVEL_MIN ), 0 ),
		'audience' => array_fill_keys( array_keys( ITA_COVERAGE_AUDIENCE_MIN ), 0 ),
		'category' => array_fill_keys( $cats ?? ita_coverage_categories(), array_fill_keys( array_keys( ITA_COVERAGE_LEVEL_MIN ), 0 ) ),
	);
	foreach ( $topics as $t ) {
		$level = is_string( $t['level'] ?? null ) ? $t['level'] : '';
		$cat   = is_string( $t['category'] ?? null ) ? $t['category'] : '';
		if ( isset( $out['level'][ $level ] ) ) {
			++$out['level'][ $level ];
		}
		$out['category'][ $cat ] = ( $out['category'][ $cat ] ?? array_fill_keys( array_keys( ITA_COVERAGE_LEVEL_MIN ), 0 ) );
		if ( isset( $out['category'][ $cat ][ $level ] ) ) {
			++$out['category'][ $cat ][ $level ];
		}
		foreach ( is_array( $t['audiences'] ?? null ) ? array_unique( $t['audiences'], SORT_REGULAR ) : array() as $a ) {
			if ( is_string( $a ) && isset( $out['audience'][ $a ] ) ) {
				++$out['audience'][ $a ];
			}
		}
	}
	return $out;
}

/**
 * Problems with the topic list (empty = fine).
 *
 * @param array<int, array<string, mixed>> $topics Topics as in topics.php.
 * @param string[]|null                    $cats   Category slugs; default the theme's six (tests pass others).
 * @return string[]
 */
function ita_lint_coverage( array $topics, ?array $cats = null ): array {
	$out = array();
	foreach ( $topics as $i => $t ) {
		$name = is_string( $t['slug'] ?? null ) ? $t['slug'] : '#' . ( $i + 1 );
		if ( ! in_array( $t['level'] ?? null, array_keys( ITA_COVERAGE_LEVEL_MIN ), true ) ) {
			$out[] = "{$name}: level must be beginner, intermediate or advanced.";
		}
		$aud = $t['audiences'] ?? null;
		if ( ! is_array( $aud ) || array_values( $aud ) !== $aud || count( $aud ) < 1 || count( $aud ) > 3 || count( array_unique( $aud, SORT_REGULAR ) ) !== count( $aud ) ) {
			$out[] = "{$name}: audiences must be a list of 1-3 different values.";
			continue;
		}
		foreach ( $aud as $a ) {
			if ( ! is_string( $a ) || ! isset( ITA_COVERAGE_AUDIENCE_MIN[ $a ] ) ) {
				$out[] = "{$name}: unknown audience.";
			}
		}
	}
	$cats = $cats ?? ita_coverage_categories();
	if ( 6 !== count( $cats ) ) {
		$out[] = 'Expected the six topic categories from ideatoapps_blog_topics(), found ' . count( $cats ) . '.';
	}
	foreach ( $topics as $i => $t ) {
		if ( ! in_array( $t['category'] ?? null, $cats, true ) ) {
			$out[] = ( is_string( $t['slug'] ?? null ) ? $t['slug'] : '#' . ( $i + 1 ) ) . ': category is not one of the six topic categories.';
		}
	}
	$c = ita_coverage_counts( $topics, $cats );
	foreach ( ITA_COVERAGE_LEVEL_MIN as $level => $min ) {
		if ( $c['level'][ $level ] < $min ) {
			$out[] = "Only {$c['level'][ $level ]} {$level} topics; at least {$min} needed.";
		}
	}
	foreach ( ITA_COVERAGE_AUDIENCE_MIN as $aud => $min ) {
		if ( $c['audience'][ $aud ] < $min ) {
			$out[] = "Only {$c['audience'][ $aud ]} topics for {$aud}; at least {$min} needed.";
		}
	}
	foreach ( $c['category'] as $cat => $levels ) {
		foreach ( ITA_COVERAGE_PER_CATEGORY as $level ) {
			if ( $levels[ $level ] < 1 ) {
				$out[] = "Category {$cat} has no {$level} topic.";
			}
		}
	}
	return $out;
}

/**
 * The coverage matrix as Markdown tables, exactly as documented in site/docs/BLOG_STYLE_GUIDE.md (the test compares them).
 *
 * @param array<int, array<string, mixed>> $topics Topics as in topics.php.
 */
function ita_coverage_markdown( array $topics ): string {
	$c     = ita_coverage_counts( $topics );
	$lines = array( '| Level | Topics | Minimum |', '| --- | --- | --- |' );
	foreach ( ITA_COVERAGE_LEVEL_MIN as $level => $min ) {
		$lines[] = "| {$level} | {$c['level'][ $level ]} | {$min} |";
	}
	$lines[] = '';
	$lines[] = '| Audience | Topics | Minimum |';
	$lines[] = '| --- | --- | --- |';
	foreach ( ITA_COVERAGE_AUDIENCE_MIN as $aud => $min ) {
		$lines[] = "| {$aud} | {$c['audience'][ $aud ]} | {$min} |";
	}
	$lines[] = '';
	$lines[] = '| Category | Beginner | Intermediate | Advanced |';
	$lines[] = '| --- | --- | --- | --- |';
	foreach ( $c['category'] as $cat => $l ) {
		$lines[] = "| {$cat} | {$l['beginner']} | {$l['intermediate']} | {$l['advanced']} |";
	}
	return implode( "\n", $lines ) . "\n";
}
