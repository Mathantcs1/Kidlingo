<?php
/**
 * Hero art for blog posts and cards. The plugin (ideatoapps-core) provides ideatoapps_post_hero_svg(); without it nothing is shown.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Inline hero SVG for a post, or '' when it has none (or the plugin is off).
 *
 * @param int $post_id Post id.
 */
function ideatoapps_hero_svg( int $post_id ): string {
	return function_exists( 'ideatoapps_post_hero_svg' ) ? ideatoapps_post_hero_svg( $post_id ) : '';
}

/**
 * Hero for a blog card: only when the post has no featured image (the image wins).
 *
 * @param WP_Post|int $post Post.
 */
function ideatoapps_card_hero( $post ): string {
	$id = $post instanceof WP_Post ? $post->ID : (int) $post;
	return $id > 0 && ! has_post_thumbnail( $id ) ? ideatoapps_hero_svg( $id ) : '';
}

// The single post hero slot: the generated art for starter posts; anything another filter already put there wins.
add_filter(
	'ideatoapps_post_hero_html',
	static fn( $html, $post_id = 0 ) => is_string( $html ) && '' !== $html ? $html : ideatoapps_hero_svg( (int) $post_id ),
	10,
	2
);
