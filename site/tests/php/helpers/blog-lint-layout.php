<?php
/**
 * Layout lints for starter articles (used by BlogContentLintTest; not shipped in the plugin):
 * - block spacing: wpautop wraps a line that touches a closing block shortcode into the box's paragraph, so every closing
 *   [/ita_prompt], [/ita_checklist], [/ita_quiz], [/ita_why] (and [/ita_figure] if ever written) ends its line and is followed by a
 *   blank line (or the end of the body);
 * - tables: every <table> has a <caption> and every <th> a scope attribute (row, col, rowgroup or colgroup);
 * - no commentary on a prompt box: the first sentence after [/ita_prompt] must not start with "The last", "Notice" or "That line",
 *   nor contain "matters more than it looks" or "do(es) a lot of work" (machine-sounding asides about the box just shown).
 */

/** Closing tags that must be followed by a blank line. */
const ITA_LINT_BLOCK_CLOSERS = array( 'ita_prompt', 'ita_checklist', 'ita_quiz', 'ita_why', 'ita_figure' );

/** A closing block shortcode with more text on its line, or a non-blank next line. */
function ita_lint_block_spacing( string $body ): array {
	$out = array();
	$re  = '/\[\/(' . implode( '|', ITA_LINT_BLOCK_CLOSERS ) . ')\]([^\n]*)(?:\n([^\n]*))?/';
	if ( preg_match_all( $re, $body, $m, PREG_SET_ORDER | PREG_OFFSET_CAPTURE ) ) {
		foreach ( $m as $hit ) {
			$line = 1 + substr_count( substr( $body, 0, $hit[0][1] ), "\n" );
			$rest = trim( $hit[2][0] );
			$next = isset( $hit[3] ) && -1 !== $hit[3][1] ? trim( $hit[3][0] ) : '';
			$end  = '' === trim( substr( $body, $hit[0][1] + strlen( $hit[0][0] ) ) );
			if ( '' !== $rest || ( '' !== $next ) || ( ! isset( $hit[3] ) && ! $end ) ) {
				$out[] = "Line {$line}: [/{$hit[1][0]}] must end its line and be followed by a blank line.";
			}
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
