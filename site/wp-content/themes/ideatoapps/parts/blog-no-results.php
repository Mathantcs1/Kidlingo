<?php
/**
 * A filtered blog list with no matches: says so and offers to clear the filters.
 *
 * Args: hint (bool, show "try a longer word" for a search with no usable word).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<div class="empty-state" data-testid="blog-no-results">
	<h2 class="empty-state__title"><?php esc_html_e( 'No articles found', 'ideatoapps' ); ?></h2>
	<p class="empty-state__text"><?php esc_html_e( 'Nothing matches those filters. Try a different word or another topic.', 'ideatoapps' ); ?></p>
	<?php if ( ! empty( $args['hint'] ) ) : ?>
		<p class="empty-state__text" data-testid="blog-search-hint"><?php esc_html_e( 'Try a longer or more specific word. Very short and very common words are ignored.', 'ideatoapps' ); ?></p>
	<?php endif; ?>
	<?php ideatoapps_part( 'button', array( 'label' => __( 'Clear filters', 'ideatoapps' ), 'href' => ideatoapps_blog_base_url(), 'variant' => 'secondary' ) ); ?>
</div>
