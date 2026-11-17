<?php
/**
 * Subscriber-only posts ("Subscribers only" box, post meta `ita_gated`).
 *
 * A post is gated when `ita_gated` is 1 AND the newsletter switch (`ideatoapps_newsletter_enabled`) is on; while the switch is off
 * everyone reads every post, so nobody is locked out with no way in. A gated post is LOCKED for the request unless the visitor can
 * edit it, or this is the post's own front-end page (not REST, a feed or an embed) and the reader cookie names a confirmed subscriber.
 *
 * Locked means the full body never leaves the server: `the_content` (page, REST content.rendered, feeds) becomes the teaser
 * (reader-teaser.php), and an empty manual excerpt (cards, search results, REST excerpt, RSS, oEmbed) is cut from the teaser too.
 * Gated pages answer `Cache-Control: private, no-store` and `Vary: Cookie`, for visitors and readers alike.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Whether gating applies to a post at all (box ticked and the newsletter switch on).
 *
 * @param int $post_id Post ID.
 */
function ideatoapps_reader_gate_applies( int $post_id ): bool {
	return $post_id > 0 && ideatoapps_newsletter_enabled() && 'post' === get_post_type( $post_id ) && '1' === (string) get_post_meta( $post_id, 'ita_gated', true );
}

/**
 * Whether the reader cookie may unlock this post in this request: only on the post's own front-end page.
 *
 * @param int $post_id Post ID.
 */
function ideatoapps_reader_cookie_counts_here( int $post_id ): bool {
	$rest = function_exists( 'wp_is_serving_rest_request' ) ? wp_is_serving_rest_request() : ( defined( 'REST_REQUEST' ) && REST_REQUEST );
	if ( $rest || is_feed() || is_embed() || ! is_singular( 'post' ) ) {
		return false;
	}
	return get_queried_object_id() === $post_id;
}

/**
 * Whether the visitor of this request gets only the teaser of a post.
 *
 * @param int $post_id Post ID.
 */
function ideatoapps_reader_is_locked( int $post_id ): bool {
	if ( ! ideatoapps_reader_gate_applies( $post_id ) || current_user_can( 'edit_post', $post_id ) ) {
		return false;
	}
	return ! ( ideatoapps_reader_cookie_counts_here( $post_id ) && ideatoapps_reader_current_subscriber() > 0 );
}

/**
 * True while this file renders a post itself (so its own content filter lets the full HTML through to be cut).
 *
 * @param bool|null $set New value.
 */
function ideatoapps_reader_rendering( ?bool $set = null ): bool {
	static $busy = false;
	if ( null !== $set ) {
		$busy = $set;
	}
	return $busy;
}

/**
 * The teaser HTML of a post, rendered through `the_content` with the post set up as the global post.
 *
 * @param int $post_id Post ID.
 */
function ideatoapps_reader_teaser_for_post( int $post_id ): string {
	$post = get_post( $post_id );
	if ( ! $post instanceof WP_Post ) {
		return '';
	}
	$saved = $GLOBALS['post'] ?? null;
	$GLOBALS['post'] = $post; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- restored below.
	setup_postdata( $post );
	ideatoapps_reader_rendering( true );
	try {
		$html = (string) apply_filters( 'the_content', $post->post_content );
	} finally {
		ideatoapps_reader_rendering( false );
		$GLOBALS['post'] = $saved; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		if ( $saved instanceof WP_Post ) {
			setup_postdata( $saved );
		}
	}
	return ideatoapps_reader_teaser( $html );
}

/**
 * Plain-text teaser of at most $words words (excerpts, meta description).
 *
 * @param int $post_id Post ID.
 * @param int $words   Word limit.
 */
function ideatoapps_reader_teaser_text( int $post_id, int $words = 55 ): string {
	$text = html_entity_decode( wp_strip_all_tags( ideatoapps_reader_teaser_for_post( $post_id ) ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	return wp_trim_words( trim( (string) preg_replace( '/\s+/u', ' ', $text ) ), $words );
}

/**
 * the_content, last: a locked post's body becomes its teaser.
 *
 * @param string $content Rendered content.
 * @return string
 */
function ideatoapps_reader_filter_content( $content ) {
	$post = get_post();
	if ( ideatoapps_reader_rendering() || ! $post instanceof WP_Post || ! ideatoapps_reader_is_locked( $post->ID ) ) {
		return $content;
	}
	return ideatoapps_reader_teaser( (string) $content );
}
add_filter( 'the_content', 'ideatoapps_reader_filter_content', 1000 );

/**
 * get_the_excerpt, before core builds one from the content: a gated post without a manual excerpt gets one from its teaser.
 *
 * @param string           $text Manual excerpt.
 * @param WP_Post|int|null $post Post.
 * @return string
 */
function ideatoapps_reader_filter_excerpt( $text, $post = null ) {
	$post = get_post( $post );
	if ( '' !== trim( (string) $text ) || ! $post instanceof WP_Post || ! ideatoapps_reader_gate_applies( $post->ID ) ) {
		return $text;
	}
	return ideatoapps_reader_teaser_text( $post->ID );
}
add_filter( 'get_the_excerpt', 'ideatoapps_reader_filter_excerpt', 9, 2 );

/**
 * Response headers for the current request: private and never stored for a gated post's page, nothing otherwise.
 *
 * @return array<string, string>
 */
function ideatoapps_reader_response_headers(): array {
	if ( ! is_singular( 'post' ) || ! ideatoapps_reader_gate_applies( get_queried_object_id() ) ) {
		return array();
	}
	return array( 'Cache-Control' => 'private, no-store, max-age=0', 'Vary' => 'Cookie' );
}

/**
 * template_redirect: send those headers and ask page caches to skip the page.
 */
function ideatoapps_reader_send_headers(): void {
	$headers = ideatoapps_reader_response_headers();
	if ( ! $headers || headers_sent() ) {
		return;
	}
	if ( ! defined( 'DONOTCACHEPAGE' ) ) {
		define( 'DONOTCACHEPAGE', true );
	}
	header_remove( 'Expires' );
	header( 'Cache-Control: ' . $headers['Cache-Control'] );
	header( 'Vary: ' . $headers['Vary'], false );
}
add_action( 'template_redirect', 'ideatoapps_reader_send_headers' );

// The gate card and the reading-link form need the theme's sign-up script on a locked post.
add_filter( 'ideatoapps_has_json_form', static fn( $has ) => $has || ( is_singular( 'post' ) && ideatoapps_reader_is_locked( get_queried_object_id() ) ) );
