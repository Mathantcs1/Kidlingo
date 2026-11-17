<?php
/**
 * The teaser of a subscriber-only post, cut from the already-rendered article HTML.
 *
 * The HTML is split into top-level blocks (a tag-depth scan that respects quoted attributes, comments, void and self-closed
 * elements and raw-text elements such as script). The teaser is the leading run of PROSE blocks (p, h1-h6, ul, ol, blockquote
 * holding no box, table, form, media or script): it stops at the first other block (prompt box, quiz, checklist, "why" box, figure,
 * table, ...), at the next heading once it holds 120 words, and before any block that would take it past 200 words. Leading
 * non-prose blocks are skipped. A block that never closes is never used. So the teaser is always whole blocks and can never end
 * inside a tag, a shortcode's markup, a table or a prompt box. If the first prose block alone is longer than 200 words, its plain
 * text is cut to 120 words instead (text, never markup).
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

const IDEATOAPPS_READER_TEASER_WORDS = 120;
const IDEATOAPPS_READER_TEASER_MAX   = 200;

/**
 * Split HTML into top-level blocks. Text between blocks belongs to the block that follows it.
 *
 * @param string $html HTML.
 * @return array<int, array{html:string, closed:bool}> In order; joined, they give back $html.
 */
function ideatoapps_reader_split_blocks( string $html ): array {
	$void   = array( 'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr' );
	$raw    = array( 'script', 'style', 'textarea', 'title' );
	$blocks = array();
	$stack  = array();
	$start  = 0;
	$pos    = 0;
	$len    = strlen( $html );
	while ( $pos < $len ) {
		$lt = strpos( $html, '<', $pos );
		if ( false === $lt ) {
			break;
		}
		if ( 0 === substr_compare( $html, '<!--', $lt, 4 ) ) {
			$end = strpos( $html, '-->', $lt + 4 );
			$pos = false === $end ? $len : $end + 3;
		} elseif ( 1 === preg_match( '/\G<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"\']|"[^"]*"|\'[^\']*\')*)>/', $html, $m, 0, $lt ) ) {
			$pos  = $lt + strlen( $m[0] );
			$name = strtolower( $m[2] );
			if ( '/' === $m[1] ) {
				$at = array_search( $name, array_reverse( $stack, true ), true );
				if ( false !== $at ) {
					array_splice( $stack, (int) $at );
				}
			} elseif ( in_array( $name, $raw, true ) ) {
				$close = stripos( $html, '</' . $name, $pos );
				$gt    = false === $close ? false : strpos( $html, '>', $close );
				$pos   = false === $gt ? $len : $gt + 1;
				if ( false === $gt ) {
					$stack[] = $name; // never closed: the rest is one unclosed block.
				}
			} elseif ( ! in_array( $name, $void, true ) && '/' !== substr( rtrim( $m[3] ), -1 ) ) {
				$stack[] = $name;
			}
		} else {
			$pos = $lt + 1;
			continue;
		}
		if ( ! $stack ) {
			$blocks[] = array( 'html' => substr( $html, $start, $pos - $start ), 'closed' => true );
			$start    = $pos;
		}
	}
	if ( $start < $len ) {
		$blocks[] = array( 'html' => substr( $html, $start ), 'closed' => ! $stack && '' === trim( substr( $html, $start ) ) );
	}
	return $blocks;
}

/**
 * Words in a block's visible text.
 *
 * @param string $html HTML.
 */
function ideatoapps_reader_word_count( string $html ): int {
	return (int) preg_match_all( '/[\p{L}\p{N}]+/u', wp_strip_all_tags( $html ) );
}

/**
 * What a block is: heading, prose, space (whitespace only) or other.
 *
 * @param array{html:string, closed:bool} $block Block.
 */
function ideatoapps_reader_block_kind( array $block ): string {
	$html = ltrim( $block['html'] );
	if ( '' === $html ) {
		return 'space';
	}
	if ( ! $block['closed'] || 1 !== preg_match( '/^<(p|h[1-6]|ul|ol|blockquote)[\s>]/i', $html, $m ) ) {
		return 'other';
	}
	if ( 1 === preg_match( '/<(?:div|details|table|pre|figure|form|iframe|script|style|svg|input|button|textarea|select|object|video|audio)\b/i', $html ) || false !== strpos( $html, '[ita_' ) ) {
		return 'other';
	}
	return 'h' === strtolower( $m[1][0] ) ? 'heading' : 'prose';
}

/**
 * The teaser HTML of a rendered article ('' when it has no prose at all). See the file comment for the rules.
 *
 * @param string $html Rendered article HTML.
 */
function ideatoapps_reader_teaser( string $html ): string {
	$out   = '';
	$words = 0;
	$taken = 0;
	foreach ( ideatoapps_reader_split_blocks( ltrim( $html ) ) as $block ) {
		$kind = ideatoapps_reader_block_kind( $block );
		if ( 'space' === $kind ) {
			$out .= $taken ? $block['html'] : '';
			continue;
		}
		if ( 'other' === $kind ) {
			if ( $taken ) {
				break;
			}
			continue;
		}
		$n = ideatoapps_reader_word_count( $block['html'] );
		if ( 'heading' === $kind && $words >= IDEATOAPPS_READER_TEASER_WORDS ) {
			break;
		}
		if ( $words + $n > IDEATOAPPS_READER_TEASER_MAX ) {
			if ( 0 === $words && 'prose' === $kind ) {
				$text = wp_trim_words( wp_strip_all_tags( $block['html'] ), IDEATOAPPS_READER_TEASER_WORDS, '' );
				return '<p>' . esc_html( html_entity_decode( $text, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) ) . '</p>';
			}
			break;
		}
		$out   .= $block['html'];
		$words += $n;
		++$taken;
	}
	// Never end on a heading (or trailing space): drop them from the end.
	while ( 1 === preg_match( '#^(.*?)(\s*<h[1-6][^>]*>(?:(?!</h[1-6]>).)*</h[1-6]>\s*)$#is', $out, $m ) ) {
		$out = $m[1];
	}
	return rtrim( $out );
}
