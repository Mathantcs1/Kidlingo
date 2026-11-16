<?php
/**
 * A filtered blog list with no matches: says so and offers to clear the filters.
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
	<?php ideatoapps_part( 'button', array( 'label' => __( 'Clear filters', 'ideatoapps' ), 'href' => ideatoapps_blog_base_url(), 'variant' => 'secondary' ) ); ?>
</div>
