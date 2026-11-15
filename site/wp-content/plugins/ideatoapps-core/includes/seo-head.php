<?php
/**
 * SEO head output: one canonical link, the meta description and Open Graph / Twitter tags. Indexable pages only.
 * (og:image is printed by the theme's brand helper; this file only picks the image through a filter.)
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Canonical URL of the current page on the constant origin: query strings are dropped except blog paging (`pg`).
 * Empty for pages that are noindex (they declare no canonical, to avoid mixed signals).
 */
function ideatoapps_seo_canonical(): string {
	global $wp;
	if ( ideatoapps_seo_is_noindex() ) {
		return '';
	}
	if ( is_front_page() && ! is_paged() ) {
		return ideatoapps_canonical_url( '/' );
	}
	$path = is_singular() ? (string) get_permalink( get_queried_object_id() ) : home_url( user_trailingslashit( (string) $wp->request ) );
	$pg   = isset( $_GET['pg'] ) ? absint( wp_unslash( $_GET['pg'] ) ) : 1; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only page number.
	$url  = ideatoapps_canonical_url( (string) wp_parse_url( $path, PHP_URL_PATH ) );
	return $pg > 1 && is_page() ? add_query_arg( 'pg', $pg, $url ) : $url;
}

/**
 * Print a meta tag.
 */
function ideatoapps_seo_meta( string $attr, string $name, string $content ): void {
	printf( '<meta %1$s="%2$s" content="%3$s">' . "\n", esc_attr( $attr ), esc_attr( $name ), esc_attr( $content ) );
}

add_action(
	'wp_head',
	static function (): void {
		if ( ! ideatoapps_seo_enabled() ) {
			return;
		}
		$canonical = ideatoapps_seo_canonical();
		if ( '' === $canonical ) {
			return;
		}
		$description = ideatoapps_seo_description();
		$title       = wp_get_document_title();
		printf( '<link rel="canonical" href="%s">' . "\n", esc_url( $canonical ) );
		if ( '' !== $description ) {
			ideatoapps_seo_meta( 'name', 'description', $description );
			ideatoapps_seo_meta( 'property', 'og:description', $description );
		}
		ideatoapps_seo_meta( 'property', 'og:type', is_singular( array( 'post', 'video' ) ) ? 'article' : 'website' );
		ideatoapps_seo_meta( 'property', 'og:title', $title );
		ideatoapps_seo_meta( 'property', 'og:url', $canonical );
		ideatoapps_seo_meta( 'property', 'og:site_name', 'IdeaToApps' );
		ideatoapps_seo_meta( 'property', 'og:locale', get_locale() );
		ideatoapps_seo_meta( 'name', 'twitter:card', 'summary_large_image' );
	},
	3
);

// The default canonical link of core would duplicate ours (it prints for singular pages only, on the request host).
add_action(
	'init',
	static function (): void {
		remove_action( 'wp_head', 'rel_canonical' );
	}
);

// Social image: the page's own featured image when it has one, otherwise the theme's logo card (see brand.php).
add_filter(
	'ideatoapps_og_image',
	static function ( array $image ): array {
		if ( ! ideatoapps_seo_enabled() || ! is_singular( array( 'app', 'video', 'post' ) ) ) {
			return $image;
		}
		$src = has_post_thumbnail( get_queried_object_id() ) ? wp_get_attachment_image_src( (int) get_post_thumbnail_id( get_queried_object_id() ), 'large' ) : false;
		return $src ? array( 'url' => $src[0], 'width' => (int) $src[1], 'height' => (int) $src[2] ) : $image;
	}
);
