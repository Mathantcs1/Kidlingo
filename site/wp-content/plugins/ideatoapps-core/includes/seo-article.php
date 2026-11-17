<?php
/**
 * Blog post SEO: Article JSON-LD on single posts, with the paywall markup of a locked subscriber-only post
 * (`isAccessibleForFree: false` and a `hasPart` WebPageElement pointing at the gate card, `.post-gated`), and the meta description
 * of a gated post taken from its manual excerpt or its teaser only. A gated post stays indexable: its teaser is real
 * server-rendered text and the rest is simply not sent (a paywall, not cloaking).
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Article structured data for a published post (empty for anything else).
 *
 * @param int $post_id Post ID.
 */
function ideatoapps_post_jsonld( int $post_id ): array {
	$post = get_post( $post_id );
	if ( ! $post instanceof WP_Post || 'post' !== $post->post_type || 'publish' !== $post->post_status ) {
		return array();
	}
	$home = ideatoapps_canonical_url( '/' );
	$url  = ideatoapps_canonical_url( (string) get_permalink( $post ) );
	$org  = array( '@type' => 'Organization', 'name' => 'IdeaToApps', 'url' => $home );
	$ld   = array(
		'@context'         => 'https://schema.org',
		'@type'            => 'Article',
		'headline'         => wp_strip_all_tags( get_the_title( $post ) ),
		'url'              => $url,
		'mainEntityOfPage' => $url,
		'datePublished'    => (string) get_post_time( 'c', true, $post ),
		'dateModified'     => (string) get_post_modified_time( 'c', true, $post ),
		'author'           => $org,
		'publisher'        => $org,
	);
	if ( ideatoapps_reader_is_locked( $post_id ) ) {
		$ld['isAccessibleForFree'] = false;
		$ld['hasPart']             = array( '@type' => 'WebPageElement', 'isAccessibleForFree' => false, 'cssSelector' => '.post-gated' );
	}
	return ideatoapps_strip_rating_data( $ld );
}

add_action(
	'wp_head',
	static function (): void {
		if ( ! is_singular( 'post' ) || ! ideatoapps_seo_enabled() ) {
			return;
		}
		$ld = ideatoapps_post_jsonld( get_queried_object_id() );
		if ( $ld ) {
			echo '<script type="application/ld+json">' . wp_json_encode( $ld, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP ) . "</script>\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- JSON with hex-escaped tags.
		}
	},
	6
);

// A gated post's description: its manual excerpt, else its teaser (never the full content the generic fallback would read).
add_filter(
	'ideatoapps_seo_description',
	static function ( $text ) {
		$id = is_singular( 'post' ) ? get_queried_object_id() : 0;
		if ( ! $id || ! ideatoapps_reader_gate_applies( $id ) ) {
			return $text;
		}
		$own = ideatoapps_seo_trim( (string) get_post_field( 'post_excerpt', $id ) );
		return '' !== $own ? $own : ideatoapps_seo_trim( ideatoapps_reader_teaser_text( $id, 40 ) );
	}
);
