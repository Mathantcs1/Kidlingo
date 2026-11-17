<?php
/**
 * Text helpers for the blog shortcodes: wpautop runs before shortcodes, so an enclosing shortcode's body arrives with <br /> and
 * <p> added. These turn that back into what the author wrote.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Body of a shortcode as plain text with its line breaks, blank lines and each line's leading spaces and tabs kept (prompt boxes
 * hold JSON and code-style text that readers copy exactly). wpautop's <br /> and </p><p> become newlines; outer blank lines and
 * trailing whitespace are dropped. The result is unescaped: the caller escapes it.
 *
 * @param mixed $content Raw body.
 * @return string Unescaped text.
 */
function ideatoapps_blog_multiline( $content ): string {
	$text = is_string( $content ) ? str_replace( array( "\r\n", "\r" ), "\n", $content ) : '';
	$text = (string) preg_replace( '#<br\s*/?>[^\S\n]*\n?#i', "\n", $text ); // the line's own newline only; the next line's indentation stays.
	$text = (string) preg_replace( '#[^\S\n]*</p>\s*<p[^>]*>#i', "\n\n", $text );
	$text = wp_strip_all_tags( wp_specialchars_decode( $text, ENT_QUOTES ) ); // trims, so protected indentation is decoded after it.
	$text = str_replace( array( "\u{A0}", '&#32;', '&#9;' ), array( ' ', ' ', "\t" ), $text );
	$text = (string) preg_replace( '/[^\S\n]+$/m', '', $text ); // trailing spaces on each line.
	$text = (string) preg_replace( '/\A\n+|\n+\z/', '', $text );
	return (string) preg_replace( "/\n{3,}/", "\n\n", $text );
}

/**
 * Content of an enclosing shortcode written on its own lines arrives from wpautop + shortcode_unautop as "</p>...<p>": drop the stray
 * leading </p> and line break, the unclosed trailing <p> and line break, and empty paragraphs.
 */
function ideatoapps_blog_unautop_edges( string $html ): string {
	return (string) preg_replace( array( '#\A(?:\s|</p>|<br\s*/?>)+#i', '#(?:\s|<p>|<br\s*/?>)+\z#i', '#<p>\s*</p>#i' ), '', $html );
}

/**
 * Before wpautop (which trims the start of every paragraph, so a line after a blank line would lose its indentation), the leading
 * spaces and tabs of each line inside [ita_prompt] are written as &#32; and &#9;. ideatoapps_blog_multiline() turns them back.
 */
function ideatoapps_blog_protect_indent( string $html ): string {
	if ( false === strpos( $html, '[ita_prompt' ) ) {
		return $html;
	}
	return (string) preg_replace_callback(
		'#\[ita_prompt\b[^\]]*\].*?\[/ita_prompt\]#s',
		static fn( array $m ): string => (string) preg_replace_callback( '/^[ \t]+/m', static fn( array $w ): string => str_replace( array( ' ', "\t" ), array( '&#32;', '&#9;' ), $w[0] ), $m[0] ),
		$html
	);
}

add_filter( 'the_content', static fn( $html ) => is_string( $html ) ? ideatoapps_blog_protect_indent( $html ) : $html, 9 );
