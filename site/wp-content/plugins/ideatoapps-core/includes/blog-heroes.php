<?php
/**
 * Generated abstract heroes (content/heroes/<starter-slug>.svg, made by scripts/make-blog-heroes.mjs). They are decorative:
 * the inline SVG is aria-hidden and has no text.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

// Post meta `ita_starter_slug` ("NN-slug") marks a starter article; anything that is not that shape is stored as ''.
add_action(
	'init',
	static function (): void {
		register_post_meta(
			'post',
			'ita_starter_slug',
			array(
				'type'              => 'string',
				'single'            => true,
				'show_in_rest'      => true,
				'sanitize_callback' => static fn( $value ): string => is_string( $value ) && 1 === preg_match( '/\A[0-9]{2}-[a-z0-9]+(?:-[a-z0-9]+)*\z/', trim( $value ) ) ? trim( $value ) : '',
				'auth_callback'     => static fn(): bool => false, // Written only by the installer (update_post_meta); REST and Custom Fields cannot attach a post to the gate or detach it.
			)
		);
	}
);

/**
 * Inline hero SVG for a starter post, or '' when the post is not one or has no hero file.
 *
 * @param int $post_id Post id.
 * @return string Trusted markup (cleaned by ideatoapps_blog_svg_clean()).
 */
function ideatoapps_post_hero_svg( int $post_id ): string {
	if ( $post_id <= 0 ) {
		return '';
	}
	$slug = get_post_meta( $post_id, 'ita_starter_slug', true );
	if ( ! is_string( $slug ) || 1 !== preg_match( '/\A[0-9]{2}-[a-z0-9]+(?:-[a-z0-9]+)*\z/', $slug ) ) {
		return '';
	}
	return ideatoapps_blog_art_svg( 'heroes', $slug, array( 'aria-hidden' => 'true', 'focusable' => 'false' ) );
}
