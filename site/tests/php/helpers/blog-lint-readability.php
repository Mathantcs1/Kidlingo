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
 *   1. a hyphenated word is split and its parts summed; a trailing possessive 's is dropped ("AI's" counts as "AI");
 *   2. lower-case, letters only; no letters counts as 1; whole words in ITA_SYLLABLE_WORDS use the hand count there;
 *   3. other words of 1-3 letters count as 1;
 *   4. "qu" and "gu" before a vowel count as consonants ("question", "language");
 *   5. a final "les" after a consonant keeps its syllable ("tables"); otherwise drop a final "es" unless it follows s, x, z, ch or
 *      sh ("boxes" keeps it); drop a final "ed" unless it follows t or d ("wanted"); drop a final silent "e", except "-le" after
 *      a consonant ("table");
 *   6. count groups of consecutive vowels (a, e, i, o, u, y), then add one for each vowel pair usually said as two syllables:
 *      "ia"/"io" not after c, s, t, g or x ("diagram", "radio", "various"; but "special", "nation", "region" stay one), "eo"
 *      ("video", "theory"), "ua"/"uo" ("actual"), "iet" ("quiet"), "ien" + c/t not after c, s or t ("client", "experience"; not
 *      "ancient", "patient", "friend"), and a vowel right before a final "ing" ("being", "going", "seeing"); at least 1.
 * Known remaining bias: it still miscounts some words ("million" and "opinion" gain one, "ratio" and "creating" lose one,
 * "every"-like compounds outside the table count their silent e), roughly balancing out over an article. Compare scores
 * between drafts rather than treating one decimal as exact.
 * Used by BlogReadabilityLintTest and ita_lint_article(); not shipped in the plugin.
 */

/** Minimum Flesch reading ease per level. */
const ITA_READABILITY_MIN = array( 'beginner' => 60, 'intermediate' => 50, 'advanced' => 40 );

/** Hand-counted words the rules get wrong (whole words, lower-case letters only). */
const ITA_SYLLABLE_WORDS = array(
	'ai'         => 2,
	'idea'       => 3,
	'ideas'      => 3,
	'area'       => 3,
	'areas'      => 3,
	'create'     => 2,
	'creates'    => 2,
	'created'    => 3,
	'creative'   => 3,
	'science'    => 2,
	'people'     => 2,
	'every'      => 2,
	'everyone'   => 3,
	'everything' => 3,
	'something'  => 2,
	'sometimes'  => 2,
	'someone'    => 2,
	'business'   => 2,
	'businesses' => 3,
);

/** Syllables in one word (see the heuristic above). */
function ita_syllables( string $word ): int {
	$parts = preg_split( '/[-\x{2010}\x{2011}]+/u', $word ) ?: array( $word );
	if ( count( $parts ) > 1 ) {
		return array_sum( array_map( 'ita_syllables', array_filter( $parts, static fn( $p ) => '' !== $p ) ) ) ?: 1;
	}
	$word = (string) preg_replace( "/['\x{2019}]s\z/iu", '', $word );
	$w    = (string) preg_replace( '/[^a-z]/', '', strtolower( $word ) );
	if ( isset( ITA_SYLLABLE_WORDS[ $w ] ) ) {
		return ITA_SYLLABLE_WORDS[ $w ];
	}
	if ( strlen( $w ) <= 3 ) {
		return 1;
	}
	$w = (string) preg_replace( '/([qg])u(?=[aeiouy])/', '$1', $w );
	if ( preg_match( '/[^aeiouy]les\z/', $w ) ) {
		$w = substr( $w, 0, -1 );
	} elseif ( preg_match( '/(?<![sxz]|ch|sh)es\z/', $w ) ) {
		$w = substr( $w, 0, -2 );
	} elseif ( preg_match( '/(?<![td])ed\z/', $w ) ) {
		$w = substr( $w, 0, -2 );
	} elseif ( preg_match( '/e\z/', $w ) && ! preg_match( '/[^aeiouy]le\z/', $w ) ) {
		$w = substr( $w, 0, -1 );
	}
	$n  = (int) preg_match_all( '/[aeiouy]+/', $w );
	$n += (int) preg_match_all( '/(?<![cstgx])i(?=[ao])|eo|u[ao]|iet|(?<![cst])ien(?=[ct])|[aeiouy](?=ing\z)/', $w );
	return max( 1, $n );
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
