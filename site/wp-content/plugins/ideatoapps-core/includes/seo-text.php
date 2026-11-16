<?php
/**
 * Page titles and meta descriptions per template. Texts only state facts the site already shows.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Plain text of at most about 155 characters.
 *
 * @param string $text Raw text or HTML.
 */
function ideatoapps_seo_trim( string $text ): string {
	$text = trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( strip_shortcodes( $text ) ) ) );
	return mb_strlen( $text ) > 155 ? rtrim( mb_substr( $text, 0, 154 ) ) . '…' : $text;
}

/**
 * Fixed descriptions of the content pages (used when the page has no excerpt of its own).
 *
 * @return array<string, string>
 */
function ideatoapps_seo_page_descriptions(): array {
	return array(
		'about'         => __( 'About IdeaToApps: who is behind the apps and how they are made.', 'ideatoapps-core' ),
		'faq'           => __( 'Answers about IdeaToApps and ClipForge: price, privacy, browsers and how to run it.', 'ideatoapps-core' ),
		'contact'       => __( 'Get in touch with IdeaToApps.', 'ideatoapps-core' ),
		'blog'          => __( 'Notes and news from IdeaToApps.', 'ideatoapps-core' ),
		'privacy'       => __( 'How IdeaToApps handles your personal data: the privacy policy.', 'ideatoapps-core' ),
		'terms'         => __( 'The terms of service for using IdeaToApps and buying its apps.', 'ideatoapps-core' ),
		'refund-policy' => __( 'The refund policy for IdeaToApps purchases.', 'ideatoapps-core' ),
	);
}

/**
 * The meta description for the current request ('' when the page has none: noindex pages).
 */
function ideatoapps_seo_description(): string {
	$text = '';
	if ( is_front_page() ) {
		$text = __( 'Practical apps built from good ideas, with clear pricing and honest write-ups.', 'ideatoapps-core' );
	} elseif ( is_post_type_archive( 'app' ) ) {
		$text = __( 'Browse the IdeaToApps apps. Clear one-time pricing, no subscriptions.', 'ideatoapps-core' );
	} elseif ( is_post_type_archive( 'video' ) ) {
		$text = __( 'Short videos about the IdeaToApps apps.', 'ideatoapps-core' );
	} elseif ( is_singular() ) {
		$post = get_queried_object();
		$text = $post instanceof WP_Post ? ideatoapps_seo_trim( (string) $post->post_excerpt ) : '';
		if ( $post instanceof WP_Post && '' === $text && 'app' === $post->post_type ) {
			$text = ideatoapps_seo_trim( (string) get_post_meta( $post->ID, 'tagline', true ) );
		}
		if ( $post instanceof WP_Post && '' === $text && 'page' === $post->post_type ) {
			$text = ideatoapps_seo_page_descriptions()[ $post->post_name ] ?? '';
		}
		if ( $post instanceof WP_Post && '' === $text ) {
			$text = ideatoapps_seo_trim( (string) $post->post_content );
		}
		if ( $post instanceof WP_Post && '' === $text ) {
			/* translators: %s: page title. */
			$text = sprintf( __( '%s on IdeaToApps.', 'ideatoapps-core' ), get_the_title( $post ) );
		}
	}
	$text = ideatoapps_seo_blog_category_description( $text );
	$page = max( (int) get_query_var( 'paged' ), ideatoapps_seo_page_number() );
	if ( '' !== $text && $page > 1 ) {
		/* translators: 1: description, 2: page number. */
		$text = sprintf( __( '%1$s Page %2$d.', 'ideatoapps-core' ), $text, $page );
	}
	return (string) apply_filters( 'ideatoapps_seo_description', $text );
}

// Titles: core builds "Page – IdeaToApps"; fix the few templates where it would be wrong or unhelpful.
add_filter(
	'document_title_parts',
	static function ( array $parts ): array {
		if ( ! ideatoapps_seo_enabled() ) {
			return $parts;
		}
		if ( is_post_type_archive( 'video' ) ) {
			$parts['title'] = __( 'Learn', 'ideatoapps-core' );
		}
		$parts['title'] = ideatoapps_seo_blog_category_title( (string) ( $parts['title'] ?? '' ) );
		if ( is_front_page() ) {
			$tagline         = trim( (string) get_bloginfo( 'description', 'display' ) );
			$parts['tagline'] = '' !== $tagline && 'Just another WordPress site' !== $tagline ? $tagline : __( 'Useful apps, brilliant ideas', 'ideatoapps-core' );
		}
		$pg = ideatoapps_seo_page_number();
		if ( $pg > 1 && is_page() ) {
			/* translators: %d: page number. */
			$parts['page'] = sprintf( __( 'Page %d', 'ideatoapps-core' ), $pg );
		}
		return $parts;
	}
);
