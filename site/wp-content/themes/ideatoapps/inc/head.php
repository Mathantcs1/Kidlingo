<?php
/**
 * Head output: no-flash theme script, font preload, emoji script removal.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Tiny constant inline script. It must run before first paint so the page never flashes the wrong theme.
 * CSP: the text is a fixed constant (no per-request data), so a `script-src 'sha256-...'` hash of exactly this string
 * works; alternatively add a nonce through the `ideatoapps_head_script_attrs` filter. It touches localStorage only in try/catch.
 */
function ideatoapps_head_script(): string {
	return "(function(){var d=document.documentElement,t;try{t=localStorage.getItem('ideatoapps-theme')}catch(e){}"
		. "if(t!=='light'&&t!=='dark'){t=window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}"
		. "d.setAttribute('data-theme',t);d.className+=' js'})();";
}

add_action(
	'wp_head',
	static function (): void {
		$attrs = (string) apply_filters( 'ideatoapps_head_script_attrs', '' );
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- constant string above; attrs are filter-controlled markup.
		echo '<script' . $attrs . '>' . ideatoapps_head_script() . "</script>\n";
		printf(
			'<link rel="preload" href="%s" as="font" type="font/woff2" crossorigin>' . "\n",
			esc_url( get_template_directory_uri() . '/assets/fonts/inter-latin-wght-normal.woff2' )
		);
	},
	1
);

/**
 * Performance: the emoji detection script (about 23 kB, plus inline CSS) is for browsers from before 2016; every browser the
 * site supports draws emoji natively. Removed from the front end, the admin and feeds.
 */
add_action(
	'init',
	static function (): void {
		remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
		remove_action( 'wp_print_styles', 'print_emoji_styles' );
		remove_action( 'admin_print_scripts', 'print_emoji_detection_script' );
		remove_action( 'admin_print_styles', 'print_emoji_styles' );
		remove_filter( 'the_content_feed', 'wp_staticize_emoji' );
		remove_filter( 'comment_text_rss', 'wp_staticize_emoji' );
		remove_filter( 'wp_mail', 'wp_staticize_emoji_for_email' );
	}
);

/**
 * Performance: jQuery (needed by WooCommerce's scripts) must not block the first paint. Asking for `defer` is safe: WordPress
 * only honours it when every script that depends on jQuery can be deferred too, and keeps the load order.
 */
add_action(
	'wp_enqueue_scripts',
	static function (): void {
		foreach ( array( 'jquery-core', 'jquery-migrate' ) as $handle ) {
			wp_script_add_data( $handle, 'strategy', 'defer' );
		}
	},
	100
);
