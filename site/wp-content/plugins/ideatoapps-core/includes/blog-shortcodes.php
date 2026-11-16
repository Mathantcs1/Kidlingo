<?php
/**
 * Interactive blog shortcodes: [ita_prompt], [ita_why], [ita_term] (here) plus the quiz (blog-quiz.php) and the checklist
 * (blog-checklist.php). Every one renders readable static HTML without JavaScript; assets/blog.js adds the behaviour.
 * Attributes are sanitised to plain text, output is escaped, and malformed or empty input degrades to text (or nothing).
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/blog-quiz.php';
require_once __DIR__ . '/blog-checklist.php';

/**
 * Plain text from an attribute or shortcode body: no tags, decoded entities, collapsed whitespace, length-capped.
 * Note: anything that looks like a tag is stripped, so a literal "<" followed by text (e.g. "a <b and c") loses that text;
 * write "less than" in attributes.
 *
 * @param mixed $value Raw value (anything non-scalar becomes an empty string).
 * @param int   $max   Maximum characters.
 * @return string Unescaped text; escape it on output.
 */
function ideatoapps_blog_clean( $value, int $max = 300 ): string {
	if ( ! is_scalar( $value ) ) {
		return '';
	}
	$text = wp_strip_all_tags( wp_specialchars_decode( (string) $value, ENT_QUOTES ) );
	$text = trim( (string) preg_replace( '/\s+/u', ' ', $text ) );
	return mb_substr( $text, 0, $max );
}

/**
 * Shortcode attributes with defaults; a bare `[tag]` yields an empty string from core, which is treated as no attributes.
 *
 * @param mixed  $atts     Raw attributes.
 * @param array  $defaults Defaults.
 * @param string $tag      Shortcode tag.
 * @return array<string,mixed>
 */
function ideatoapps_blog_atts( $atts, array $defaults, string $tag ): array {
	return shortcode_atts( $defaults, is_array( $atts ) ? $atts : array(), $tag );
}

/**
 * A page-unique id for aria wiring (`ita-quiz-1`).
 *
 * @param string $prefix Prefix.
 * @return string
 */
function ideatoapps_blog_uid( string $prefix ): string {
	static $counts = array();
	$counts[ $prefix ] = ( $counts[ $prefix ] ?? 0 ) + 1;
	return $prefix . '-' . $counts[ $prefix ];
}

/**
 * Body of a shortcode as text with line breaks kept (wpautop has already turned them into <br> and <p>).
 *
 * @param mixed $content Raw body.
 * @return string Unescaped text.
 */
function ideatoapps_blog_multiline( $content ): string {
	$text = is_string( $content ) ? $content : '';
	$text = (string) preg_replace( '#<br\s*/?>\s*#i', "\n", $text );
	$text = (string) preg_replace( '#</p>\s*<p[^>]*>#i', "\n\n", $text );
	$text = wp_strip_all_tags( wp_specialchars_decode( $text, ENT_QUOTES ) );
	$text = str_replace( array( "\r\n", "\r", "\u{A0}" ), array( "\n", "\n", ' ' ), $text );
	return trim( (string) preg_replace( "/\n{3,}/", "\n\n", $text ) );
}

/**
 * [ita_prompt title=""]text[/ita_prompt]: a prompt in a box; JavaScript adds the copy button.
 *
 * @param mixed  $atts    Attributes.
 * @param string $content Prompt text.
 * @return string
 */
function ideatoapps_blog_prompt( $atts, $content = '' ): string {
	$atts = ideatoapps_blog_atts( $atts, array( 'title' => '' ), 'ita_prompt' );
	$text = ideatoapps_blog_multiline( is_string( $content ) ? do_shortcode( $content ) : '' ); // nested [ita_term] becomes its word.
	if ( '' === $text ) {
		return '';
	}
	$title = ideatoapps_blog_clean( $atts['title'], 120 );
	$title = '' === $title ? __( 'Try this prompt', 'ideatoapps-core' ) : $title;
	return '<div class="ita-prompt" data-testid="ita-prompt" data-ita-prompt>'
		. '<p class="ita-prompt__title">' . esc_html( $title ) . '</p>'
		. '<pre class="ita-prompt__text">' . esc_html( $text ) . '</pre></div>';
}

/**
 * [ita_why title=""]text[/ita_why]: an expandable box (native details, so it needs no JavaScript).
 *
 * @param mixed  $atts    Attributes.
 * @param string $content Body; a few inline and list tags are kept.
 * @return string
 */
function ideatoapps_blog_why( $atts, $content = '' ): string {
	$atts = ideatoapps_blog_atts( $atts, array( 'title' => '' ), 'ita_why' );
	$body = wp_kses(
		is_string( $content ) ? do_shortcode( $content ) : '', // nested shortcodes first, then everything is filtered.
		array(
			'abbr'   => array( 'class' => true, 'data-testid' => true, 'tabindex' => true, 'title' => true ),
			'a'      => array( 'href' => true ),
			'strong' => array(),
			'em'     => array(),
			'b'      => array(),
			'i'      => array(),
			'code'   => array(),
			'br'     => array(),
			'p'      => array(),
			'ul'     => array(),
			'ol'     => array(),
			'li'     => array(),
		)
	);
	if ( '' === trim( wp_strip_all_tags( $body ) ) ) {
		return '';
	}
	$title = ideatoapps_blog_clean( $atts['title'], 120 );
	$title = '' === $title ? __( 'Why?', 'ideatoapps-core' ) : $title;
	return '<details class="ita-why" data-testid="ita-why"><summary>' . esc_html( $title ) . '</summary>'
		. '<div class="ita-why__body">' . $body . '</div></details>';
}

/**
 * [ita_term define=""]word[/ita_term]: the definition is in `title` (works without JavaScript); JS shows it as a tooltip.
 *
 * @param mixed  $atts    Attributes.
 * @param string $content The word.
 * @return string
 */
function ideatoapps_blog_term( $atts, $content = '' ): string {
	$atts = ideatoapps_blog_atts( $atts, array( 'define' => '' ), 'ita_term' );
	$word = ideatoapps_blog_clean( $content, 120 );
	if ( '' === $word ) {
		return '';
	}
	$define = ideatoapps_blog_clean( $atts['define'], 300 );
	if ( '' === $define ) {
		return esc_html( $word );
	}
	return '<abbr class="ita-term" data-testid="ita-term" tabindex="0" title="' . esc_attr( $define ) . '">' . esc_html( $word ) . '</abbr>';
}

add_shortcode( 'ita_prompt', 'ideatoapps_blog_prompt' );
add_shortcode( 'ita_why', 'ideatoapps_blog_why' );
add_shortcode( 'ita_term', 'ideatoapps_blog_term' );

/** Prompt text is copied verbatim: keep wptexturize from turning its quotes and dashes into typographic ones. */
add_filter(
	'no_texturize_shortcodes',
	static function ( $tags ) {
		$tags[] = 'ita_prompt';
		return $tags;
	}
);

/**
 * Whether the assets are needed for this request: any single blog post, or any singular page that uses one of the shortcodes.
 *
 * @return bool
 */
function ideatoapps_blog_assets_needed(): bool {
	if ( ! is_singular() ) {
		return false;
	}
	$post = get_queried_object();
	if ( ! $post instanceof WP_Post ) {
		return false;
	}
	if ( 'post' === $post->post_type ) {
		return true;
	}
	foreach ( array( 'ita_prompt', 'ita_quiz', 'ita_q', 'ita_checklist', 'ita_item', 'ita_why', 'ita_term' ) as $tag ) {
		if ( has_shortcode( $post->post_content, $tag ) ) {
			return true;
		}
	}
	return false;
}

/** Enqueue blog.css, blog.js and blog-learn.js (deferred, in the footer). */
function ideatoapps_blog_enqueue(): void {
	if ( ! ideatoapps_blog_assets_needed() ) {
		return;
	}
	$dir = IDEATOAPPS_CORE_DIR . 'assets/';
	$ver = static function ( string $file ) use ( $dir ): string {
		return file_exists( $dir . $file ) ? (string) filemtime( $dir . $file ) : IDEATOAPPS_CORE_VERSION;
	};
	wp_enqueue_style( 'ita-blog', plugins_url( 'assets/blog.css', IDEATOAPPS_CORE_FILE ), array(), $ver( 'blog.css' ) );
	$args = array( 'in_footer' => true, 'strategy' => 'defer' );
	wp_enqueue_script( 'ita-blog', plugins_url( 'assets/blog.js', IDEATOAPPS_CORE_FILE ), array(), $ver( 'blog.js' ), $args ); // helpers, prompt, checklist.
	wp_enqueue_script( 'ita-blog-learn', plugins_url( 'assets/blog-learn.js', IDEATOAPPS_CORE_FILE ), array( 'ita-blog' ), $ver( 'blog-learn.js' ), $args ); // quiz, glossary.
}
add_action( 'wp_enqueue_scripts', 'ideatoapps_blog_enqueue' );
