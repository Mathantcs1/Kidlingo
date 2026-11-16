<?php
/**
 * Layout lints for starter articles (used by BlogContentLintTest; not shipped in the plugin):
 * - block spacing: a closing [/ita_prompt], [/ita_why], [/ita_checklist] or [/ita_quiz] immediately followed on the next line
 *   (no blank line) by another opening shortcode ([ita_...]) makes wpautop wrap the second block in a <p> (the 05 and 20 bug).
 *   A closing tag followed by a paragraph or heading renders fine and is allowed; the render lint (blog-lint-render.php)
 *   checks the HTML itself;
 * - tables: every <table> has a <caption> and every <th> a scope attribute (row, col, rowgroup or colgroup);
 * - no commentary on a prompt box: the first sentence after [/ita_prompt] must not start with "The last", "Notice" or "That line",
 *   nor contain "matters more than it looks" or "do(es) a lot of work" (machine-sounding asides about the box just shown).
 */

/** Closing tags that must not be followed on the very next line by another opening shortcode. */
const ITA_LINT_BLOCK_CLOSERS = array( 'ita_prompt', 'ita_why', 'ita_checklist', 'ita_quiz' );

/** A closing block shortcode whose next line starts with an opening shortcode, without a blank line between. */
function ita_lint_block_spacing( string $body ): array {
	$out = array();
	$re  = '/\[\/(' . implode( '|', ITA_LINT_BLOCK_CLOSERS ) . ')\][^\S\n]*\n[^\S\n]*\[ita_/';
	if ( preg_match_all( $re, $body, $m, PREG_SET_ORDER | PREG_OFFSET_CAPTURE ) ) {
		foreach ( $m as $hit ) {
			$line  = 1 + substr_count( substr( $body, 0, $hit[0][1] ), "\n" );
			$out[] = "Line {$line}: [/{$hit[1][0]}] is followed on the next line by another shortcode; add a blank line between them.";
		}
	}
	return $out;
}

/** Every table has a caption; every th has a scope. */
function ita_lint_tables( string $body ): array {
	$out = array();
	preg_match_all( '#<table\b[^>]*>(.*?)</table>#is', $body, $tables );
	foreach ( $tables[1] as $i => $inner ) {
		if ( ! preg_match( '#<caption\b[^>]*>\s*\S.*?</caption>#is', $inner ) ) {
			$out[] = 'Table ' . ( $i + 1 ) . ' needs a non-empty <caption>.';
		}
	}
	if ( substr_count( strtolower( $body ), '<table' ) !== count( $tables[0] ) ) {
		$out[] = 'Every <table> needs a closing </table>.';
	}
	preg_match_all( '#<th\b([^>]*)>#i', $body, $ths );
	foreach ( $ths[1] as $atts ) {
		if ( ! preg_match( '/\bscope\s*=\s*["\']?(?:row|col|rowgroup|colgroup)\b/i', $atts ) ) {
			$out[] = 'Every <th> needs scope="col" or scope="row".';
			break;
		}
	}
	return $out;
}

/** The first sentence after each prompt box must not comment on the box. */
function ita_lint_after_prompt( string $body ): array {
	$out = array();
	foreach ( preg_split( '/\[\/ita_prompt\]/', $body ) ?: array() as $i => $after ) {
		if ( 0 === $i ) {
			continue;
		}
		$chunk    = (string) preg_split( '/\[ita_|<h[1-6]\b/i', $after, 2 )[0];
		$text     = trim( (string) preg_replace( '/\s+/u', ' ', html_entity_decode( strip_tags( $chunk ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ) ) );
		$sentence = (string) preg_split( '/(?<=[.!?])\s/u', $text, 2 )[0];
		if ( preg_match( '/\A(?:The last|Notice|That line)\b/i', $sentence ) || preg_match( '/matters more than it looks|\bdo(?:es)? a lot of work\b/i', $sentence ) ) {
			$out[] = "Prompt box {$i}: the sentence after it comments on the box (\"" . mb_substr( $sentence, 0, 60 ) . '").';
		}
	}
	return $out;
}

/** All layout lints. */
function ita_lint_layout( string $body ): array {
	return array_merge( ita_lint_block_spacing( $body ), ita_lint_tables( $body ), ita_lint_after_prompt( $body ) );
}
