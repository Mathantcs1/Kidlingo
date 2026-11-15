<?php
/**
 * Fallback template for archives, search and anything without a specific template: post cards or an empty state.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<section class="section">
	<div class="container">
		<?php ideatoapps_part( 'section-heading', array( 'title' => is_home() ? get_bloginfo( 'name' ) : wp_strip_all_tags( get_the_archive_title() ?: get_the_title() ), 'level' => 1 ) ); ?>
		<?php ideatoapps_part( 'post-list', array( 'posts' => $wp_query->posts ) ); ?>
		<?php the_posts_pagination( array( 'mid_size' => 1, 'prev_text' => __( 'Previous', 'ideatoapps' ), 'next_text' => __( 'Next', 'ideatoapps' ) ) ); ?>
	</div>
</section>
<?php
get_footer();
