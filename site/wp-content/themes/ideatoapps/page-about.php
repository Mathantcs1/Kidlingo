<?php
/**
 * About: only what can be verified. The tagline, and that ClipForge is the first app.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_clip = get_posts( ideatoapps_visible_apps_args( array( 'name' => 'clipforge', 'posts_per_page' => 1 ) ) );
get_header();
?>
<article class="section page" data-testid="page-about">
	<div class="container container--narrow">
		<?php ideatoapps_part( 'section-heading', array( 'level' => 1, 'title' => __( 'About IdeaToApps', 'ideatoapps' ), 'text' => __( 'Useful apps. Brilliant ideas. One place.', 'ideatoapps' ) ) ); ?>
		<div class="prose">
			<p><?php esc_html_e( 'IdeaToApps is where useful apps live. ClipForge, a video editor that runs in your browser, is the first app.', 'ideatoapps' ); ?></p>
			<?php if ( '' !== trim( wp_strip_all_tags( get_post_field( 'post_content', get_queried_object_id() ) ) ) ) : ?>
				<?php echo wp_kses_post( apply_filters( 'the_content', get_post_field( 'post_content', get_queried_object_id() ) ) ); ?>
			<?php endif; ?>
		</div>
		<div class="section-actions">
			<?php
			if ( $ideatoapps_clip ) {
				ideatoapps_part( 'button', array( 'label' => __( 'See ClipForge', 'ideatoapps' ), 'href' => get_permalink( $ideatoapps_clip[0] ) ) );
			}
			ideatoapps_part( 'button', array( 'label' => __( 'Browse all apps', 'ideatoapps' ), 'href' => home_url( '/apps/' ), 'variant' => 'secondary' ) );
			?>
		</div>
	</div>
</article>
<?php
get_footer();
