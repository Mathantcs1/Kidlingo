<?php
/**
 * Blog post cards, or an empty state when there are no posts.
 *
 * Args: posts (WP_Post[]), featured (WP_Post, optional: shown as a large card above the grid; pass it separately from `posts`).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_posts    = (array) ( $args['posts'] ?? array() );
$ideatoapps_featured = ( $args['featured'] ?? null ) instanceof WP_Post ? $args['featured'] : null;
if ( ! $ideatoapps_posts && ! $ideatoapps_featured ) {
	?>
	<div class="empty-state" data-testid="blog-empty">
		<h2 class="empty-state__title"><?php esc_html_e( 'No posts yet', 'ideatoapps' ); ?></h2>
		<p class="empty-state__text"><?php esc_html_e( 'Nothing has been published here so far. Check back soon.', 'ideatoapps' ); ?></p>
	</div>
	<?php
	return;
}
if ( $ideatoapps_featured ) {
	?>
	<div class="blog-featured" data-testid="blog-featured">
		<?php ideatoapps_part( 'card', array_merge( ideatoapps_blog_card_args( $ideatoapps_featured, 44 ), array( 'class' => 'card--featured' ) ) ); ?>
	</div>
	<?php
}
if ( $ideatoapps_posts ) {
	?>
<div class="grid" data-testid="blog-list">
	<?php
	foreach ( $ideatoapps_posts as $ideatoapps_post ) {
		ideatoapps_part( 'card', ideatoapps_blog_card_args( $ideatoapps_post ) );
	}
	?>
</div>
	<?php
}
