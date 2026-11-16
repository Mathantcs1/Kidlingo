<?php
/**
 * [ita_figure name="" alt="" caption=""]: an original diagram from content/figures/<name>.svg, printed inline inside a <figure>.
 * Anything doubtful (unknown or odd name, missing or overlong alt text, unreadable or unsafe file) renders nothing, never a notice.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/blog-svg.php';
require_once __DIR__ . '/blog-art-files.php';
require_once __DIR__ . '/blog-heroes.php';

const IDEATOAPPS_FIGURE_ALT_MAX = 140;

/**
 * Shortcode callback.
 *
 * @param mixed $atts Attributes.
 * @return string
 */
function ideatoapps_blog_figure( $atts ): string {
	$atts = ideatoapps_blog_atts( $atts, array( 'name' => '', 'alt' => '', 'caption' => '' ), 'ita_figure' );
	$name = is_string( $atts['name'] ) ? $atts['name'] : '';
	$alt  = ideatoapps_blog_clean( $atts['alt'], 1000 );
	if ( '' === $alt || mb_strlen( $alt ) > IDEATOAPPS_FIGURE_ALT_MAX ) {
		return '';
	}
	$svg = ideatoapps_blog_art_svg( 'figures', $name, array( 'role' => 'img', 'aria-label' => $alt, 'focusable' => 'false' ) );
	if ( '' === $svg ) {
		return '';
	}
	$caption = ideatoapps_blog_clean( $atts['caption'], 240 );
	$html = '<figure class="ita-figure" data-testid="ita-figure">' . $svg
		. ( '' === $caption ? '' : '<figcaption>' . esc_html( $caption ) . '</figcaption>' ) . '</figure>';
	ideatoapps_blog_figures_made( $html );
	return $html;
}

/**
 * Remember (for this request) the exact markup ideatoapps_blog_figure() produced, or ask whether a string is one of them.
 * Only those strings may bypass wp_kses in [ita_why]; a <figure> someone typed into the editor is never one of them.
 *
 * @param string $html  Markup to remember or look up.
 * @param bool   $check True to look up instead of remember.
 * @return bool Whether it was produced by the shortcode (always true when remembering).
 */
function ideatoapps_blog_figures_made( string $html, bool $check = false ): bool {
	static $made = array();
	if ( $check ) {
		return isset( $made[ md5( $html ) ] );
	}
	$made[ md5( $html ) ] = true;
	return true;
}
add_shortcode( 'ita_figure', 'ideatoapps_blog_figure' );

/**
 * Move figures made by [ita_figure] in this request out of a string before it goes through wp_kses (which would strip the SVG) and put them back after.
 *
 * @param string $html Rendered HTML (by reference; figures are replaced by plain-text markers).
 * @return array<string,string> Marker => figure markup, for ideatoapps_blog_figures_restore().
 */
function ideatoapps_blog_figures_hold( string &$html ): array {
	$held = array();
	$html = (string) preg_replace_callback(
		'#<figure class="ita-figure" data-testid="ita-figure">.*?</figure>#s',
		static function ( array $m ) use ( &$held ): string {
			if ( ! ideatoapps_blog_figures_made( $m[0], true ) ) {
				return $m[0]; // not produced by [ita_figure] in this request: leave it for wp_kses to filter.
			}
			$marker          = 'ITAFIG' . count( $held ) . 'X' . wp_generate_password( 8, false );
			$held[ $marker ] = $m[0];
			return $marker;
		},
		$html
	);
	return $held;
}

/**
 * Put held figures back.
 *
 * @param string               $html Filtered HTML.
 * @param array<string,string> $held From ideatoapps_blog_figures_hold().
 * @return string
 */
function ideatoapps_blog_figures_restore( string $html, array $held ): string {
	return strtr( $html, $held );
}

/** Whether the figure and hero colours are needed: posts, the blog and archives (cards show heroes), not other pages. */
function ideatoapps_blog_art_needed(): bool {
	return (bool) apply_filters( 'ideatoapps_blog_art_needed', is_singular( 'post' ) || is_home() || is_category() || is_tag() || is_search() || is_page( 'blog' ) );
}

/** Enqueue assets/blog-art.css (figure and hero colours for dark and light). */
function ideatoapps_blog_art_enqueue(): void {
	if ( ! ideatoapps_blog_art_needed() && ! ideatoapps_blog_assets_needed() ) {
		return;
	}
	$file = IDEATOAPPS_CORE_DIR . 'assets/blog-art.css';
	wp_enqueue_style( 'ita-blog-art', plugins_url( 'assets/blog-art.css', IDEATOAPPS_CORE_FILE ), array(), file_exists( $file ) ? (string) filemtime( $file ) : IDEATOAPPS_CORE_VERSION );
}
add_action( 'wp_enqueue_scripts', 'ideatoapps_blog_art_enqueue' );
