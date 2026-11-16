<?php
/**
 * Readability lint (Task 5b): Flesch reading ease of an article's visible text, with a minimum per level.
 *
 *   score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words)
 *
 * Higher is easier: 60-70 is plain English, 50-60 fairly hard, 30-50 hard. Thresholds: beginner >= 60, intermediate >= 50,
 * advanced >= 40. Visible text is what a reader sees: HTML tags are stripped, shortcode markup ([ita_...]) is removed, and the
 * text a shortcode shows (prompt and checklist bodies, quiz question, answers and why, figure caption) is kept.
 *
 * Sentences: a block (paragraph, heading, list item, caption, prompt, quiz question or answer) always ends a sentence, so a
 * heading without a full stop is not glued to the next paragraph; inside a block, ".", "!" or "?" followed by a space ends one.
 *
 * Syllables (a simple heuristic, good to about one syllable per long word, which is enough to compare drafts):
 *   1. lower-case the word and keep letters only; a hyphenated word is split and its parts summed; no letters counts as 1;
 *   2. words of 1-3 letters count as 1;
 *   3. drop a final "es" unless it follows s, x, z, ch or sh ("boxes" keeps it); drop a final "ed" unless it follows t or d
 *      ("wanted" keeps it); drop a final silent "e", except "-le" after a consonant ("table");
 *   4. count groups of consecutive vowels (a, e, i, o, u, y); at least 1.
 * Used by BlogReadabilityLintTest and ita_lint_article(); not shipped in the plugin.
 */

/** Minimum Flesch reading ease per level. */
const ITA_READABILITY_MIN = array( 'beginner' => 60, 'intermediate' => 50, 'advanced' => 40 );

/** Syllables in one word (see the heuristic above). */
function ita_syllables( string $word ): int {
	$parts = preg_split( '/[-\x{2010}\x{2011}]+/u', $word ) ?: array( $word );
	if ( count( $parts ) > 1 ) {
		return array_sum( array_map( 'ita_syllables', array_filter( $parts, static fn( $p ) => '' !== $p ) ) ) ?: 1;
	}
	$w = (string) preg_replace( '/[^a-z]/', '', strtolower( $word ) );
	if ( strlen( $w ) <= 3 ) {
		return 1;
	}
	if ( preg_match( '/(?<![sxz]|ch|sh)es\z/', $w ) ) {
		$w = substr( $w, 0, -2 );
	} elseif ( preg_match( '/(?<![td])ed\z/', $w ) ) {
		$w = substr( $w, 0, -2 );
	} elseif ( preg_match( '/e\z/', $w ) && ! preg_match( '/[^aeiouy]le\z/', $w ) ) {
		$w = substr( $w, 0, -1 );
	}
	return max( 1, (int) preg_match_all( '/[aeiouy]+/', $w ) );
}

/**
 * Visible text as blocks (one string per paragraph, heading, list item, prompt, quiz question, answer, why or caption).
 *
 * @return string[]
 */
function ita_readability_blocks( string $body ): array {
	$t = (string) preg_replace( '/<!--.*?-->/s', ' ', $body );
	$t = (string) preg_replace_callback(
		'/\[ita_q(?=[\s\]\/])([^\]]*)\]/',
		static function ( array $m ): string {
			$a = shortcode_parse_atts( trim( $m[1] ) );
			$a = is_array( $a ) ? $a : array();
			return "\n" . ( $a['q'] ?? '' ) . "\n" . str_replace( '|', "\n", (string) ( $a['answers'] ?? '' ) ) . "\n" . ( $a['why'] ?? '' ) . "\n";
		},
		$t
	);
	$t = (string) preg_replace_callback(
		'/\[ita_figure(?=[\s\]\/])([^\]]*)\]/',
		static function ( array $m ): string {
			$a = shortcode_parse_atts( trim( $m[1] ) );
			return "\n" . ( is_array( $a ) ? (string) ( $a['caption'] ?? '' ) : '' ) . "\n";
		},
		$t
	);
	$t = (string) preg_replace( '/\[ita_term(?=[\s\]])[^\]]*\]|\[\/ita_term\]/', '', $t ); // inline: the word stays in its sentence.
	$t = (string) preg_replace( '/\[\/?ita_[a-z]+[^\]]*\]/', "\n", $t );
	$t = (string) preg_replace( '#<(?:/(?:p|h[1-6]|li|ul|ol|blockquote|figcaption|td|th|div|pre)|br\s*/?)>#i', "\n", $t );
	$t = html_entity_decode( strip_tags( (string) preg_replace( '/</', ' <', $t ) ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	$out = array();
	foreach ( preg_split( '/\n+/', $t ) ?: array() as $block ) {
		$block = trim( (string) preg_replace( '/\s+/u', ' ', $block ) );
		if ( 0 < ita_lint_word_count( $block ) ) {
			$out[] = $block;
		}
	}
	return $out;
}

/**
 * Words, sentences, syllables and the Flesch reading ease of a body.
 *
 * @return array{words:int, sentences:int, syllables:int, score:float}
 */
function ita_readability( string $body ): array {
	$words     = 0;
	$sentences = 0;
	$syllables = 0;
	foreach ( ita_readability_blocks( $body ) as $block ) {
		foreach ( preg_split( '/(?<=[.!?])["\x{201D}\')]*\s+/u', $block ) ?: array() as $sentence ) {
			preg_match_all( "/[\\p{L}\\p{N}]+(?:['\u{2019}-][\\p{L}\\p{N}]+)*/u", $sentence, $m );
			if ( ! $m[0] ) {
				continue;
			}
			++$sentences;
			$words += count( $m[0] );
			foreach ( $m[0] as $w ) {
				$syllables += ita_syllables( $w );
			}
		}
	}
	$score = $words > 0 ? 206.835 - 1.015 * ( $words / max( 1, $sentences ) ) - 84.6 * ( $syllables / $words ) : 0.0;
	return array( 'words' => $words, 'sentences' => $sentences, 'syllables' => $syllables, 'score' => round( $score, 1 ) );
}

/** Problems when the body is harder to read than its level allows. */
function ita_lint_readability( string $body, string $level ): array {
	if ( ! isset( ITA_READABILITY_MIN[ $level ] ) ) {
		return array( "Unknown level \"{$level}\" for the readability check." );
	}
	$r = ita_readability( $body );
	return $r['score'] < ITA_READABILITY_MIN[ $level ]
		? array( "Flesch reading ease {$r['score']} is below " . ITA_READABILITY_MIN[ $level ] . " for {$level}: use shorter sentences and plainer words." )
		: array();
}
