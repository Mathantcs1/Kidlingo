<?php
/**
 * Render lint (used by BlogRenderLintTest; not shipped): an article body goes through the real `the_content` filters (wptexturize,
 * wpautop, shortcode_unautop, do_shortcode, ... in WordPress's own priority order), and the HTML must be clean:
 * - no <p> that contains a block element (div, details, figure, table, ul, ol, pre) before it closes;
 * - no </p> right after a block's opening or closing tag (a stray close left by wpautop);
 * - no empty <p></p> (whitespace or a lone <br> only);
 * - no leftover shortcode text ([ita_... or [/ita_...);
 * - prompt boxes: no <br> in the copied text, and the same number of non-empty lines as the source prompt;
 * - every [ita_figure] renders a <figure> with an <svg>; every quiz renders exactly 3 questions.
 */

const ITA_RENDER_BLOCKS = 'div|details|figure|table|ul|ol|pre';

/** The body as the theme renders it. */
function ita_render_body( string $body ): string {
	return (string) apply_filters( 'the_content', $body );
}

/**
 * Problems in the rendered HTML of a source body.
 *
 * @param string      $body Source body (article file without its header).
 * @param string|null $html Rendered HTML; rendered here when null (tests pass a broken one).
 * @return string[]
 */
function ita_lint_render( string $body, ?string $html = null ): array {
	$html = $html ?? ita_render_body( $body );
	$b    = ITA_RENDER_BLOCKS;
	$out  = array();
	$snip = static fn( string $s ): string => mb_substr( (string) preg_replace( '/\s+/', ' ', $s ), 0, 70 );
	if ( preg_match( "#<p\\b[^>]*>(?:(?!</p>|<p\\b).)*?<(?:{$b})\\b#is", $html, $m ) ) {
		$out[] = 'A <p> wraps a block element: "' . $snip( $m[0] ) . '".';
	}
	if ( preg_match( "#(?:</(?:{$b})>|<(?:{$b})\\b[^>]*>)\\s*</p>#i", $html, $m ) ) {
		$out[] = 'Stray </p> next to a block tag: "' . $snip( $m[0] ) . '".';
	}
	if ( preg_match( '#<p\b[^>]*>(?:\s|&nbsp;|<br\s*/?>)*</p>#i', $html, $m ) ) {
		$out[] = 'Empty paragraph: "' . $snip( $m[0] ) . '".';
	}
	if ( preg_match( '#\[/?ita_[a-z_]*#', $html, $m ) ) {
		$out[] = 'Shortcode text left in the page: "' . $m[0] . '".';
	}
	preg_match_all( '#\[ita_prompt\b[^\]]*\](.*?)\[/ita_prompt\]#s', $body, $src );
	preg_match_all( '#<pre class="ita-prompt__text">(.*?)</pre>#s', $html, $pre );
	if ( count( $src[1] ) !== count( $pre[1] ) ) {
		$out[] = count( $src[1] ) . ' prompt boxes in the source, ' . count( $pre[1] ) . ' rendered.';
	} else {
		$lines = static fn( string $t ): int => count( array_filter( array_map( 'trim', explode( "\n", $t ) ), 'strlen' ) );
		foreach ( $pre[1] as $i => $text ) {
			if ( preg_match( '#<br|&lt;br#i', $text ) ) {
				$out[] = 'Prompt box ' . ( $i + 1 ) . ' has a <br> in its text.';
			} elseif ( $lines( html_entity_decode( $text ) ) !== $lines( wp_strip_all_tags( $src[1][ $i ] ) ) ) {
				$out[] = 'Prompt box ' . ( $i + 1 ) . ' has a different number of lines than its source.';
			}
		}
	}
	$figs = (int) preg_match_all( '#\[ita_figure\b#', $body );
	if ( $figs !== (int) preg_match_all( '#<figure\b[^>]*>(?:(?!</figure>).)*?<svg\b#is', $html ) ) {
		$out[] = "{$figs} figures in the source, but not every one renders an <svg>.";
	}
	$quizzes = preg_split( '#<div class="ita-quiz"#', $html ) ?: array();
	if ( (int) preg_match_all( '#\[ita_quiz\]#', $body ) !== count( $quizzes ) - 1 ) {
		$out[] = 'Not every quiz rendered.';
	}
	foreach ( array_slice( $quizzes, 1 ) as $i => $quiz ) {
		$n = (int) preg_match_all( '#<li class="ita-q"#', (string) preg_split( '#<div class="ita-quiz"#', $quiz )[0] );
		if ( 3 !== $n ) {
			$out[] = 'Quiz ' . ( $i + 1 ) . " renders {$n} questions, not 3.";
		}
	}
	return $out;
}
