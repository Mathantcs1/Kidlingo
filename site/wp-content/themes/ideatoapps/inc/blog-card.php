<?php
/**
 * Blog cards: the card args for a post (category label, date, excerpt, reading time, level, generated hero).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Card args for a blog post (shared by the grid and the featured card).
 *
 * @return array<string, mixed>
 */
function ideatoapps_blog_card_args( WP_Post $post, int $words = 28 ): array {
	$label = '';
	$rank  = 99;
	$topics = ideatoapps_blog_topics();
	foreach ( get_the_category( $post->ID ) as $term ) { // the best-ranked topic category, else the first other one.
		if ( (int) $term->term_id === (int) get_option( 'default_category' ) ) {
			continue;
		}
		$at   = array_search( $term->slug, $topics, true );
		$here = false === $at ? 98 : (int) $at;
		if ( $here < $rank ) {
			$rank  = $here;
			$label = $term->name;
		}
	}
	return array(
		'title'       => get_the_title( $post ),
		'href'        => get_permalink( $post ),
		'label'       => $label,
		'eyebrow'     => get_the_date( '', $post ),
		'text'        => wp_trim_words( wp_strip_all_tags( get_the_excerpt( $post ) ), $words ),
		/* translators: %d: minutes to read. */
		'meta'        => sprintf( __( '%d min read', 'ideatoapps' ), ideatoapps_reading_minutes( $post->ID ) ),
		'image_id'    => (int) get_post_thumbnail_id( $post ),
		'hero_html'   => ideatoapps_card_hero( $post ),
		'level_label' => ideatoapps_blog_levels()[ ideatoapps_post_level( $post->ID ) ] ?? '',
		'heading'     => 2,
	);
}
