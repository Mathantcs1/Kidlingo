<?php
/**
 * Learn (/learn/): the published videos, each with a click-to-play frame. Empty state when there are none.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_channel = ideatoapps_youtube_channel_url();
get_header();
?>
<section class="section learn" data-testid="learn">
	<div class="container">
		<?php ideatoapps_part( 'section-heading', array( 'level' => 1, 'title' => __( 'Learn', 'ideatoapps' ), 'text' => __( 'Short videos about the apps.', 'ideatoapps' ) ) ); ?>
		<?php if ( have_posts() ) : ?>
			<div class="video-grid">
				<?php
				while ( have_posts() ) {
					the_post();
					ideatoapps_part( 'video-card', array( 'video' => get_post(), 'show_app' => true ) );
				}
				?>
			</div>
			<?php the_posts_pagination( array( 'mid_size' => 1, 'prev_text' => __( 'Previous', 'ideatoapps' ), 'next_text' => __( 'Next', 'ideatoapps' ) ) ); ?>
			<?php if ( '' !== $ideatoapps_channel ) : ?>
				<div class="section-actions">
					<?php ideatoapps_part( 'button', array( 'label' => __( 'Visit our YouTube channel', 'ideatoapps' ), 'href' => $ideatoapps_channel, 'variant' => 'secondary', 'attrs' => array( 'rel' => 'noopener noreferrer' ) ) ); ?>
				</div>
			<?php endif; ?>
		<?php else : ?>
			<div class="empty-state" data-testid="learn-empty">
				<h2 class="empty-state__title"><?php esc_html_e( 'No videos yet', 'ideatoapps' ); ?></h2>
				<p class="empty-state__text"><?php esc_html_e( 'The first videos are on their way. Check back soon.', 'ideatoapps' ); ?></p>
			</div>
		<?php endif; ?>
	</div>
</section>
<?php
ideatoapps_part( 'newsletter' );
get_footer();
