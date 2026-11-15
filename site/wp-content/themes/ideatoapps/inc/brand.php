<?php
/**
 * Brand assets: favicon, touch icon, theme colour and the default social image.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Absolute URL of the default Open Graph / Twitter image (1200x630 PNG).
 *
 * Task 9 (full SEO) owns per-page og tags and consumes this helper as the fallback image.
 */
function ideatoapps_default_og_image(): string {
	return get_theme_file_uri( 'assets/img/og-default.png' );
}

/**
 * The logo mark as a decorative image (the wordmark text next to it names the brand, so alt is empty).
 * Echoes escaped markup; 40px at 1x, 80px at 2x.
 */
function ideatoapps_brand_mark(): void {
	printf(
		'<img class="brand-mark" src="%1$s" srcset="%2$s 2x" width="40" height="40" alt="" decoding="async">',
		esc_url( get_theme_file_uri( 'assets/img/logo-mark-40.png' ) ),
		esc_url( get_theme_file_uri( 'assets/img/logo-mark-80.png' ) )
	);
}

/** Brand dark navy used for the browser UI colour (matches --bg in dark mode). */
function ideatoapps_theme_color(): string {
	return '#0B1230';
}

/** True when an SEO plugin (or a filter) already prints og:image, so the theme must not print a second one. */
function ideatoapps_other_og_image_present(): bool {
	$present = defined( 'WPSEO_VERSION' ) || defined( 'RANK_MATH_VERSION' ) || defined( 'AIOSEO_VERSION' )
		|| defined( 'SEOPRESS_VERSION' ) || defined( 'THE_SEO_FRAMEWORK_VERSION' )
		|| ( defined( 'JETPACK__VERSION' ) && has_action( 'wp_head', 'jetpack_og_tags' ) );
	return (bool) apply_filters( 'ideatoapps_has_og_image', $present );
}

add_action(
	'wp_head',
	static function (): void {
		// A site icon chosen in the Customizer wins over the theme icons (core prints it at priority 99).
		if ( ! has_site_icon() ) {
			printf( '<link rel="icon" href="%s" sizes="any">' . "\n", esc_url( get_theme_file_uri( 'assets/img/favicon.ico' ) ) );
			printf( '<link rel="icon" type="image/png" sizes="32x32" href="%s">' . "\n", esc_url( get_theme_file_uri( 'assets/img/favicon-32.png' ) ) );
			printf( '<link rel="apple-touch-icon" sizes="180x180" href="%s">' . "\n", esc_url( get_theme_file_uri( 'assets/img/apple-touch-icon.png' ) ) );
		}
		printf( '<meta name="theme-color" content="%s">' . "\n", esc_attr( ideatoapps_theme_color() ) );
		if ( ! ideatoapps_other_og_image_present() ) {
			$image = ideatoapps_default_og_image();
			printf( '<meta property="og:image" content="%s">' . "\n", esc_url( $image ) );
			printf( '<meta property="og:image:width" content="1200">' . "\n" . '<meta property="og:image:height" content="630">' . "\n" );
			printf( '<meta name="twitter:image" content="%s">' . "\n", esc_url( $image ) );
		}
	},
	2
);
