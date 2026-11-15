<?php
/**
 * Blog post cards, or an empty state when there are no posts.
 *
 * Args: posts (WP_Post[]).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_posts = (array) ( $args['posts'] ?? array() );
if ( ! $ideatoapps_posts ) {
	?>
	<div class="empty-state" data-testid="blog-empty">
		<h2 class="empty-state__title"><?php esc_html_e( 'No posts yet', 'ideatoapps' ); ?></h2>
		<p class="empty-state__text"><?php esc_html_e( 'Nothing has been published here so far. Check back soon.', 'ideatoapps' ); ?></p>
	</div>
	<?php
	return;
}
?>
<div class="grid" data-testid="blog-list">
	<?php
	foreach ( $ideatoapps_posts as $ideatoapps_post ) {
		ideatoapps_part(
			'card',
			array(
				'title'    => get_the_title( $ideatoapps_post ),
				'href'     => get_permalink( $ideatoapps_post ),
				'eyebrow'  => get_the_date( '', $ideatoapps_post ),
				'text'     => wp_trim_words( wp_strip_all_tags( get_the_excerpt( $ideatoapps_post ) ), 28 ),
				'image_id' => (int) get_post_thumbnail_id( $ideatoapps_post ),
				'heading'  => 2,
			)
		);
	}
	?>
</div>
