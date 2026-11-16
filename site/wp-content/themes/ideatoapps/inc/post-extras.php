<?php
/**
 * Helpers for the single blog post page: reading time, table of contents, "Read next" and the last-reviewed date.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const IDEATOAPPS_WORDS_PER_MINUTE = 220;

/**
 * Valid `YYYY-MM-DD` (a real calendar date) or null.
 *
 * @param mixed $value Raw value.
 */
function ideatoapps_valid_review_date( $value ): ?string {
	if ( ! is_string( $value ) || 1 !== preg_match( '/\A(\d{4})-(\d{2})-(\d{2})\z/', $value, $m ) || ! checkdate( (int) $m[2], (int) $m[3], (int) $m[1] ) ) {
		return null;
	}
	return $value;
}

// Post meta `ita_last_reviewed` (YYYY-MM-DD). Anything that is not a real date is stored as an empty string.
add_action(
	'init',
	static function (): void {
		register_post_meta(
			'post',
			'ita_last_reviewed',
			array(
				'type'              => 'string',
				'single'            => true,
				'show_in_rest'      => true,
				'sanitize_callback' => static fn( $value ): string => ideatoapps_valid_review_date( is_string( $value ) ? trim( $value ) : $value ) ?? '',
				'auth_callback'     => static fn( $allowed, $meta_key, $post_id ): bool => current_user_can( 'edit_post', (int) $post_id ) && ( ! function_exists( 'ideatoapps_review_status' ) || '' === ideatoapps_review_status( (int) $post_id ) ), // Set by the human sign-off on posts under review.
			)
		);
	}
);

/**
 * The post's "last reviewed" date as `YYYY-MM-DD`, or null when it is missing or not a real date.
 */
function ideatoapps_last_reviewed( int $post_id ): ?string {
	$date = ideatoapps_valid_review_date( get_post_meta( $post_id, 'ita_last_reviewed', true ) );
	$date = apply_filters( 'ideatoapps_last_reviewed', $date, $post_id ); // The plugin's human-review gate may replace or hide it.
	return is_string( $date ) ? ideatoapps_valid_review_date( $date ) : null;
}

/**
 * Minutes to read a post: words / 220 rounded up, at least 1. Shortcode tags (not the text inside them) and HTML are ignored.
 */
function ideatoapps_reading_minutes( int $post_id ): int {
	$text = (string) get_post_field( 'post_content', $post_id );
	$text = preg_replace( '/\[\/?[A-Za-z_][\w-]*(?:\s[^\]]*)?\]/', ' ', $text ) ?? $text;
	$text = html_entity_decode( wp_strip_all_tags( $text ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	$words = preg_match_all( '/[\p{L}\p{N}]+(?:[\'\x{2019}-][\p{L}\p{N}]+)*/u', $text );
	return max( 1, (int) ceil( (int) $words / IDEATOAPPS_WORDS_PER_MINUTE ) );
}

/**
 * Ids the theme and plugin print on every page (header, footer, forms, section headings). A generated heading id never equals one.
 *
 * @return string[]
 */
function ideatoapps_reserved_ids(): array {
	return (array) apply_filters(
		'ideatoapps_reserved_ids',
		array(
			'main', 'content', 'primary', 'header', 'footer', 'nav-drawer', 'menu-button', 'form-status', 'wpadminbar', 'newsletter', 'newsletter-title',
			'newsletter-email', 'newsletter-consent', 'contact-name', 'contact-email', 'contact-message', 'contact-website', 'catalog-category',
			'catalog-search', 'catalog-sort', 'post-next-title', 'related-apps-title', 'categories-title', 'featured-apps-title',
			'how-it-works-title', 'watch-learn-title', 'app-faq-title', 'app-features-title', 'app-requirements-title', 'app-whats-new-title',
		)
	);
}

/**
 * Give every `h2` that has text a unique, stable, ASCII `id` and list them for a table of contents. Existing attributes and ids are
 * kept and never reused; empty headings are left alone; ids the page prints elsewhere are never used. Duplicates get -2, -3 and so on;
 * a heading with no ASCII letters or digits becomes section-N (N = its position in the contents).
 *
 * The opening tag is matched with quoted attribute values, so a `>` inside a value is fine.
 *
 * @param string $html Rendered post content.
 * @return array{html:string, items:array<int, array{id:string, text:string}>}
 */
function ideatoapps_post_toc( string $html ): array {
	$used = array_fill_keys( ideatoapps_reserved_ids(), true );
	if ( preg_match_all( '/\sid\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>"\']+))/i', $html, $found, PREG_SET_ORDER ) ) {
		foreach ( $found as $m ) {
			$used[ $m[1] . ( $m[2] ?? '' ) . ( $m[3] ?? '' ) ] = true;
		}
	}
	$items = array();

	$out = preg_replace_callback(
		'/<h2(?=[\s>])((?:[^\'">]++|"[^"]*+"|\'[^\']*+\')*+)>(.*?)<\/h2>/is',
		static function ( array $m ) use ( &$used, &$items ): string {
			$text = trim( (string) preg_replace( '/\s+/u', ' ', html_entity_decode( wp_strip_all_tags( $m[2] ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ) ) );
			if ( '' === $text ) {
				return $m[0];
			}
			$attrs = $m[1];
			if ( 1 === preg_match( '/\sid\s*=\s*(?:"([^"]+)"|\'([^\']+)\'|([^\s>"\']+))/i', $attrs, $own ) ) {
				$items[] = array( 'id' => $own[1] . ( $own[2] ?? '' ) . ( $own[3] ?? '' ), 'text' => $text );
				return $m[0];
			}
			$attrs = preg_replace( '/\sid\s*=\s*(?:""|\'\')/i', '', $attrs ) ?? $attrs; // an empty id attribute is replaced.
			$base  = sanitize_title_with_dashes( remove_accents( $text ), '', 'display' );
			$base  = trim( (string) preg_replace( '/%[0-9a-f]{2}/i', '', $base ), '-' ); // non-Latin text is percent-encoded: keep ids plain ASCII.
			$base  = '' === $base ? 'section-' . ( count( $items ) + 1 ) : $base;
			$id    = $base;
			for ( $n = 2; isset( $used[ $id ] ); $n++ ) {
				$id = "$base-$n";
			}
			$used[ $id ] = true;
			$items[]     = array( 'id' => $id, 'text' => $text );
			return '<h2' . $attrs . ' id="' . $id . '">' . $m[2] . '</h2>';
		},
		$html
	);
	if ( ! is_string( $out ) ) { // a PCRE error must never blank the article: show it unchanged, without contents.
		return array( 'html' => $html, 'items' => array() );
	}
	return array( 'html' => $out, 'items' => $items );
}

/**
 * Up to $n other published posts: same category first, then the newest of the rest.
 *
 * @return WP_Post[]
 */
function ideatoapps_read_next( int $post_id, int $n ): array {
	$n = max( 0, min( 12, $n ) );
	if ( 0 === $n ) {
		return array();
	}
	$base = array(
		'post_type'           => 'post',
		'post_status'         => 'publish',
		'ignore_sticky_posts' => true,
		'no_found_rows'       => true,
		'orderby'             => array( 'date' => 'DESC', 'ID' => 'DESC' ),
	);
	$picked = array();
	$cats   = wp_get_post_categories( $post_id );
	if ( $cats ) {
		$same = new WP_Query( $base + array( 'posts_per_page' => $n, 'category__in' => $cats, 'post__not_in' => array( $post_id ) ) );
		$picked = array_values( array_filter( $same->posts, static fn( $p ) => $p instanceof WP_Post ) );
	}
	if ( count( $picked ) < $n ) {
		$skip   = array_merge( array( $post_id ), wp_list_pluck( $picked, 'ID' ) );
		$rest   = new WP_Query( $base + array( 'posts_per_page' => $n - count( $picked ), 'post__not_in' => $skip ) );
		$picked = array_merge( $picked, array_values( array_filter( $rest->posts, static fn( $p ) => $p instanceof WP_Post ) ) );
	}
	return array_slice( $picked, 0, $n );
}
