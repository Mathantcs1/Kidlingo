<?php
/**
 * Fallback template: simple content list. Specific templates arrive in later tasks.
 *
 * @package IdeaToApps
 */

get_header();
?>
<section class="section">
	<div class="container">
		<?php ideatoapps_part( 'section-heading', array( 'title' => is_home() ? get_bloginfo( 'name' ) : wp_strip_all_tags( get_the_archive_title() ?: get_the_title() ), 'level' => 1 ) ); ?>
		<?php if ( have_posts() ) : ?>
			<?php
			while ( have_posts() ) :
				the_post();
				ideatoapps_part( 'card', array( 'title' => get_the_title(), 'href' => get_permalink(), 'text' => wp_strip_all_tags( get_the_excerpt() ) ) );
			endwhile;
			?>
		<?php else : ?>
			<p><?php esc_html_e( 'Nothing here yet.', 'ideatoapps' ); ?></p>
		<?php endif; ?>
	</div>
</section>
<?php
get_footer();
