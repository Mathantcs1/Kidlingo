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
 * The plugin's SEO module (Task 9) prints the other og tags and uses this as the fallback image.
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

/**
 * Browser UI colour per colour scheme (matches --bg of each theme). The meta tags follow the visitor's OS setting only:
 * a meta tag cannot react to the on-page theme toggle (the pair is static HTML; documented in site/docs/ENVIRONMENT.md).
 *
 * @return array<string, string> Media query => colour.
 */
function ideatoapps_theme_colors(): array {
	return array(
		'(prefers-color-scheme: dark)'  => ideatoapps_theme_color(),
		'(prefers-color-scheme: light)' => '#F8FAFF',
	);
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
		foreach ( ideatoapps_theme_colors() as $media => $color ) {
			printf( '<meta name="theme-color" content="%1$s" media="%2$s">' . "\n", esc_attr( $color ), esc_attr( $media ) );
		}
		if ( ! ideatoapps_other_og_image_present() ) {
			// The SEO module (plugin) swaps in an item's own featured image; the logo card is the fallback.
			$image = (array) apply_filters( 'ideatoapps_og_image', array( 'url' => ideatoapps_default_og_image(), 'width' => 1200, 'height' => 630 ) );
			printf( '<meta property="og:image" content="%s">' . "\n", esc_url( (string) ( $image['url'] ?? '' ) ) );
			if ( ! empty( $image['width'] ) && ! empty( $image['height'] ) ) {
				printf( '<meta property="og:image:width" content="%1$d">' . "\n" . '<meta property="og:image:height" content="%2$d">' . "\n", (int) $image['width'], (int) $image['height'] );
			}
			printf( '<meta name="twitter:image" content="%s">' . "\n", esc_url( (string) ( $image['url'] ?? '' ) ) );
		}
	},
	2
);
