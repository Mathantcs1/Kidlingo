<?php
/**
 * Head output: no-flash theme script, font preload.
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
