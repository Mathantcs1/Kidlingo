<?php
/**
 * Content lint rules for starter articles (used by BlogContentLintTest; not shipped in the plugin).
 * Every rule takes a string and returns a list of problems (empty = fine), so each rule can be tested with bad input.
 */

require_once __DIR__ . '/blog-lint-voice.php';

/** Shortcode tags an article may use. */
const ITA_LINT_TAGS = array( 'ita_prompt', 'ita_quiz', 'ita_q', 'ita_checklist', 'ita_item', 'ita_why', 'ita_term', 'ita_figure' );

/** Attributes of every `[tag ...]` opening in a body (self-closing or enclosing), parsed like WordPress does. */
function ita_lint_tags( string $body, string $tag ): array {
	$found = array();
	if ( preg_match_all( '/\[' . preg_quote( $tag, '/' ) . '(?=[\s\]\/])([^\]]*)\]/', $body, $m ) ) {
		foreach ( $m[1] as $raw ) {
			$atts    = shortcode_parse_atts( trim( rtrim( trim( $raw ), '/' ) ) );
			$found[] = is_array( $atts ) ? $atts : array();
		}
	}
	return $found;
}

/** Visible text: tags and shortcode markup removed; prompt, quiz, checklist and Why text kept; figure captions kept. */
function ita_lint_visible_text( string $body ): string {
	$text = (string) preg_replace( '/<!--.*?-->/s', ' ', $body );
	$text = (string) preg_replace_callback(
		'/\[ita_q(?=[\s\]\/])([^\]]*)\]/',
		static function ( array $m ): string {
			$a = shortcode_parse_atts( trim( $m[1] ) );
			$a = is_array( $a ) ? $a : array();
			return ' ' . ( $a['q'] ?? '' ) . ' ' . str_replace( '|', ' ', (string) ( $a['answers'] ?? '' ) ) . ' ' . ( $a['why'] ?? '' ) . ' ';
		},
		$text
	);
	$text = (string) preg_replace_callback(
		'/\[ita_figure(?=[\s\]\/])([^\]]*)\]/',
		static function ( array $m ): string {
			$a = shortcode_parse_atts( trim( $m[1] ) );
			return ' ' . ( is_array( $a ) ? (string) ( $a['caption'] ?? '' ) : '' ) . ' ';
		},
		$text
	);
	$text = (string) preg_replace( '/\[\/?ita_[a-z]+[^\]]*\]/', ' ', $text );
	$text = html_entity_decode( strip_tags( (string) preg_replace( '/</', ' <', $text ) ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	return trim( (string) preg_replace( '/\s+/u', ' ', $text ) );
}

function ita_lint_word_count( string $text ): int {
	return (int) preg_match_all( "/[\\p{L}\\p{N}]+(?:['\u{2019}-][\\p{L}\\p{N}]+)*/u", $text );
}

/** 700-1,300 words of visible text. */
function ita_lint_length( string $body ): array {
	$n = ita_lint_word_count( ita_lint_visible_text( $body ) );
	return $n < 700 || $n > 1300 ? array( "Word count {$n} is outside 700-1300." ) : array();
}

/** Every [ita_*] tag is known and enclosing tags are balanced. */
function ita_lint_shortcodes( string $body ): array {
	$out = array();
	preg_match_all( '/\[\/?(ita_[a-z_]*)/', $body, $m );
	foreach ( array_unique( $m[1] ) as $tag ) {
		if ( ! in_array( $tag, ITA_LINT_TAGS, true ) ) {
			$out[] = "Unknown shortcode [{$tag}].";
		}
	}
	foreach ( array( 'ita_prompt', 'ita_quiz', 'ita_checklist', 'ita_item', 'ita_why', 'ita_term' ) as $tag ) {
		$open  = count( ita_lint_tags( $body, $tag ) );
		$close = substr_count( $body, '[/' . $tag . ']' );
		if ( $open !== $close ) {
			$out[] = "[{$tag}] opened {$open} times but closed {$close} times.";
		}
	}
	return $out;
}

/** Exactly one quiz with exactly 3 questions; each has text, 2+ non-empty answers, a correct position in range and a why. */
function ita_lint_quiz( string $body ): array {
	$quizzes = count( ita_lint_tags( $body, 'ita_quiz' ) );
	if ( 1 !== $quizzes || 1 !== preg_match( '/\[ita_quiz\](.*?)\[\/ita_quiz\]/s', $body, $m ) ) {
		return array( "Expected exactly one [ita_quiz]...[/ita_quiz], found {$quizzes}." );
	}
	$qs  = ita_lint_tags( $m[1], 'ita_q' );
	$out = 3 === count( $qs ) && count( ita_lint_tags( $body, 'ita_q' ) ) === 3 ? array() : array( 'The quiz needs exactly 3 [ita_q] (and none outside it).' );
	foreach ( $qs as $i => $q ) {
		$answers = explode( '|', (string) ( $q['answers'] ?? '' ) );
		$correct = (string) ( $q['correct'] ?? '' );
		if ( '' === trim( (string) ( $q['q'] ?? '' ) ) || count( $answers ) < 2 || in_array( '', array_map( 'trim', $answers ), true ) ) {
			$out[] = 'Question ' . ( $i + 1 ) . ' needs text and at least 2 non-empty answers.';
		}
		if ( 1 !== preg_match( '/\A\d{1,2}\z/', $correct ) || (int) $correct < 1 || (int) $correct > count( $answers ) ) {
			$out[] = 'Question ' . ( $i + 1 ) . ' has no correct answer in range.';
		}
		if ( '' === trim( (string) ( $q['why'] ?? '' ) ) ) {
			$out[] = 'Question ' . ( $i + 1 ) . ' needs a why.';
		}
	}
	return $out;
}

/** At least one prompt box or checklist. */
function ita_lint_interactive( string $body ): array {
	return ita_lint_tags( $body, 'ita_prompt' ) || ita_lint_tags( $body, 'ita_checklist' ) ? array() : array( 'Needs at least one [ita_prompt] or [ita_checklist].' );
}

/** 3-5 h2 headings, the last one "Try it". */
function ita_lint_headings( string $body ): array {
	preg_match_all( '#<h2[^>]*>(.*?)</h2>#is', $body, $m );
	$n   = count( $m[1] );
	$out = $n < 3 || $n > 5 ? array( "Expected 3-5 h2 headings, found {$n}." ) : array();
	if ( ! $n || 'Try it' !== trim( strip_tags( (string) end( $m[1] ) ) ) ) {
		$out[] = 'The last h2 must be "Try it".';
	}
	return $out;
}

/** Figures: known name, alt 1-140 characters, at most 3. */
function ita_lint_figures( string $body, string $figure_dir ): array {
	$figs = ita_lint_tags( $body, 'ita_figure' );
	$out  = count( $figs ) > 3 ? array( 'At most 3 figures.' ) : array();
	foreach ( $figs as $f ) {
		$name = (string) ( $f['name'] ?? '' );
		$alt  = trim( (string) ( $f['alt'] ?? '' ) );
		if ( 1 !== preg_match( '/\A[a-z0-9-]+\z/', $name ) || ! is_file( $figure_dir . '/' . $name . '.svg' ) ) {
			$out[] = "Figure \"{$name}\" does not exist.";
		}
		if ( '' === $alt || mb_strlen( $alt ) > 140 ) {
			$out[] = "Figure \"{$name}\" needs alt text of 1-140 characters.";
		}
	}
	return $out;
}

/** Problems for every pattern that matches the text. */
function ita_lint_patterns( string $text, array $patterns, string $what ): array {
	$out = array();
	foreach ( $patterns as $re ) {
		if ( preg_match( $re, $text, $m ) ) {
			$out[] = "{$what}: \"{$m[0]}\".";
		}
	}
	return $out;
}

function ita_lint_emails( string $text ): array {
	return ita_lint_patterns( $text, array( '/[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i' ), 'Email address' );
}

function ita_lint_links( string $text ): array {
	return ita_lint_patterns( $text, array( '#https?://#i', '/\bhref\b/i', '/\bwww\./i' ), 'Link' );
}

function ita_lint_first_person( string $text ): array {
	$q = "['\u{2019}]";
	return ita_lint_patterns(
		$text,
		array( '/\bin my experience\b/i', '/\bI tested\b/', '/\bwe tested\b/i', '/\bI tried\b/', "/\\bI{$q}ve used\\b/u", '/\bour users\b/i', '/\bour customers\b/i', '/\bI asked\b/', '/\bwhen I\s/i' ),
		'First-person experience claim'
	);
}

function ita_lint_currency( string $text ): array {
	return ita_lint_patterns( $text, array( '/[$€£¥₹]/u', '/\b(?:USD|EUR|GBP|JPY|INR)\b/', '/\b(?:dollars?|euros?|cents?|pence)\b/i' ), 'Currency' );
}

function ita_lint_versions( string $text ): array {
	$families = 'GPT|ChatGPT|Claude|Gemini|Gemma|Llama|LLaMA|Mistral|Mixtral|Grok|PaLM|Bard|Phi|Qwen|DeepSeek|Falcon|Copilot|Opus|Sonnet|Haiku|DALL-?E|Midjourney|Stable\s+Diffusion';
	return ita_lint_patterns( $text, array( '/\b(?:' . $families . ')[\s-]?v?\d+(?:\.\d+)?/i', '/\bo[1-9]\b(?:-mini)?/' ), 'Model version' );
}

function ita_lint_filler( string $text ): array {
	$q = "['\u{2019}]";
	return ita_lint_patterns(
		$text,
		array( "/in today{$q}s fast-paced world/iu", '/\bdelv(?:e|es|ed|ing)\b/i', '/\bunlock/i', '/\bgame[- ]?changer/i', '/\brevolutioni[sz]/i', "/\\bit(?:{$q}s| is) important to note\\b/iu", '/\bas an AI\b/i' ),
		'Filler phrase'
	);
}

function ita_lint_superlatives( string $text ): array {
	return ita_lint_patterns(
		$text,
		array( '/\bthe best\b/i', '/\bstate[- ]of[- ]the[- ]art\b/i', '/\bcutting[- ]edge\b/i', '/\bworld[- ]class\b/i', '/\brevolutionary\b/i', '/\b(?:industry|market)[- ]leading\b/i' ),
		'Superlative'
	);
}

/** All text rules over one string. */
function ita_lint_text_rules( string $text ): array {
	return array_merge( ita_lint_emails( $text ), ita_lint_links( $text ), ita_lint_first_person( $text ), ita_lint_currency( $text ), ita_lint_versions( $text ), ita_lint_filler( $text ), ita_lint_superlatives( $text ) );
}

/** Every rule over a parsed article: the parser's array plus the raw file text. */
function ita_lint_article( array $a, string $raw, string $content_dir ): array {
	$out = array();
	if ( ! is_file( $content_dir . '/heroes/' . $a['slug'] . '.svg' ) ) {
		$out[] = 'No hero file for ' . $a['slug'] . '.';
	}
	if ( mb_strlen( $a['excerpt'] ) > 160 ) {
		$out[] = 'Excerpt is longer than 160 characters.';
	}
	if ( count( $a['check'] ) < 3 || count( $a['check'] ) > 6 ) {
		$out[] = 'check needs 3-6 items.';
	}
	return array_merge(
		$out,
		ita_lint_length( $a['body'] ),
		ita_lint_shortcodes( $a['body'] ),
		ita_lint_quiz( $a['body'] ),
		ita_lint_interactive( $a['body'] ),
		ita_lint_headings( $a['body'] ),
		ita_lint_figures( $a['body'], $content_dir . '/figures' ),
		ita_lint_quiz_variety( $a['body'] ),
		ita_lint_voice( $a['body'] ),
		ita_lint_prompt_term( $a['body'] ),
		ita_lint_spelling( $raw ),
		ita_lint_text_rules( $raw )
	);
}
