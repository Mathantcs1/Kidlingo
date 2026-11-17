<?php
/**
 * Series rules for starter articles (v6 polish rules): cross-reference form and per-article phrase budgets. Each rule takes text
 * (visible text from ita_lint_visible_text()) and returns problems, so each can be tested with bad input. Justified exceptions are
 * listed in blog-lint-series-allow.txt ("<two-digit prefix> <rule> <limit> <reason>").
 */

/** "It's [time of day]" scene openers ("It's Sunday evening", "It's 7 a.m.", "It's the end of your shift"). */
const ITA_LINT_TIME = '(?:\d|early|late|midnight|noon|morning|evening|night|the (?:end|start|middle|night|morning|evening|first|last)\b|(?:a )?(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day)';

/** Per-article phrase budgets: rule => [regex, limit, label]. */
const ITA_LINT_BUDGETS = array(
	'such-as'    => array( '/\bsuch as\b/i', 2, '"such as"' ),
	'hedges'     => array( '/(?<!more |less |most |how |as )\b(?:often|usually)\b(?! enough)/i', 4, '"often" + "usually"' ),
	'differ'     => array( '/\bdiffers? between\b/i', 1, '"differ(s) between"' ),
	'warmth'     => array( "/\\b(?:If you['\u{2019}]ve ever|You['\u{2019}]ve probably)\\b/", 1, 'warmth formulas ("If you\'ve ever", "You\'ve probably")' ),
	'hypothesis' => array( "/(?:\\A|[.!?:]\\s+)(?:Say you|Imagine\\b|Picture an?\\b|It['\u{2019}]s " . ITA_LINT_TIME . ')/', 1, 'hypothetical lead-ins' ),
	'same-pivot' => array( '/\bThe same (?:[\w-]+ ){0,3}(?:works?|applies|helps)\b/', 0, '"The same ... works/applies/helps" pivots' ),
);

/** Series cap on "It's [time]" openers. */
const ITA_LINT_TIME_OPENERS_MAX = 8;

/** Articles allowed more than one cross-reference (the task asked for more). */
const ITA_LINT_XREF_MULTI = array( '42', '47', '50' );

/** Allowlist: "prefix rule" => raised limit. */
function ita_lint_series_allow(): array {
	$out = array();
	foreach ( (array) file( __DIR__ . '/blog-lint-series-allow.txt', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES ) as $line ) {
		if ( preg_match( '/^(\d\d) ([a-z-]+) (\d+) \S/', (string) $line, $m ) ) {
			$out[ $m[1] . ' ' . $m[2] ] = (int) $m[3];
		}
	}
	return $out;
}

/** Phrase budgets for one article's visible text; $prefix is its two-digit number (for the allowlist). */
function ita_lint_budgets( string $text, string $prefix = '', array $allow = array() ): array {
	$out = array();
	foreach ( ITA_LINT_BUDGETS as $rule => list( $re, $limit, $label ) ) {
		$limit = $allow[ $prefix . ' ' . $rule ] ?? $limit;
		$n     = (int) preg_match_all( $re, $text );
		if ( $n > $limit ) {
			$out[] = "{$n} {$label} (at most {$limit}).";
		}
	}
	return $out;
}

/** Number of "It's [time]" openers in a text. */
function ita_lint_time_openers( string $text ): int {
	return (int) preg_match_all( "/(?:\\A|[.!?:]\\s+)It['\u{2019}]s " . ITA_LINT_TIME . '/', $text );
}

/** A regex for a topic title: case-sensitive, any quote style inside it ('knows' or "knows"). */
function ita_lint_title_regex( string $title ): string {
	$parts = preg_split( "/[\"'\u{2018}\u{2019}\u{201C}\u{201D}]/u", $title );
	return '/' . implode( "[\"'\u{2018}\u{2019}\u{201C}\u{201D}]", array_map( static fn( $p ) => preg_quote( $p, '/' ), $parts ) ) . '/u';
}

/**
 * Cross-references to other topics: every title mention is inside double quotes (straight or curly), a quoted title is not followed
 * by a stock verb unless written as (the article "X" explains ...), and at most $max mentions per article.
 *
 * @param string   $text   Visible text.
 * @param string[] $titles Titles of the OTHER topics.
 * @param int      $max    Most cross-references allowed.
 */
function ita_lint_cross_refs( string $text, array $titles, int $max = 1 ): array {
	$out   = array();
	$count = 0;
	foreach ( $titles as $title ) {
		if ( ! preg_match_all( ita_lint_title_regex( $title ), $text, $m, PREG_OFFSET_CAPTURE ) ) {
			continue;
		}
		foreach ( $m[0] as list( $hit, $at ) ) {
			++$count;
			$before = substr( $text, max( 0, $at - 3 ), min( 3, $at ) );
			$after  = substr( $text, $at + strlen( $hit ), 3 );
			if ( ! preg_match( '/(?:"|\xE2\x80\x9C)\z/', $before ) || ! preg_match( '/\A(?:"|\xE2\x80\x9D)/', $after ) ) {
				$out[] = "Title \"{$title}\" is not in double quotes.";
				continue;
			}
			$lead = substr( $text, max( 0, $at - 16 ), min( 16, $at ) ); // bytes (no /u below): room for a curly quote.
			$tail = substr( $text, $at + strlen( $hit ), 40 );
			if ( preg_match( '/\A\S+\s+(?:explains|covers|shows|lists|describes|goes|warns|stresses)\b/', $tail ) && ! preg_match( '/the article (?:"|\xE2\x80\x9C)\z/', $lead ) ) {
				$out[] = "Title \"{$title}\" is the subject of a stock verb; write (see \"...\") or (the article \"...\" explains why).";
			}
		}
	}
	if ( $count > $max ) {
		$out[] = "{$count} cross-references (at most {$max}).";
	}
	return $out;
}
