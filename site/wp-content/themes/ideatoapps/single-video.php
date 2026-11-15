<?php
/**
 * A single video: click-to-play frame, description and the related app.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
while ( have_posts() ) {
	the_post();
	$ideatoapps_video = get_post();
	$ideatoapps_app   = ideatoapps_video_related_app( $ideatoapps_video->ID );
	?>
	<article class="section video-page" data-testid="video-page">
		<div class="container container--narrow">
			<nav class="breadcrumb" aria-label="<?php esc_attr_e( 'Breadcrumb', 'ideatoapps' ); ?>">
				<ol>
					<li><a href="<?php echo esc_url( (string) get_post_type_archive_link( 'video' ) ); ?>"><?php esc_html_e( 'Learn', 'ideatoapps' ); ?></a></li>
					<li aria-current="page"><?php the_title(); ?></li>
				</ol>
			</nav>
			<h1><?php the_title(); ?></h1>
			<?php ideatoapps_part( 'video-frame', array( 'video' => $ideatoapps_video ) ); ?>
			<?php if ( '' !== trim( wp_strip_all_tags( get_the_content() ) ) ) : ?>
				<div class="prose"><?php the_content(); ?></div>
			<?php endif; ?>
			<?php if ( $ideatoapps_app ) : ?>
				<div class="section-actions">
					<?php
					/* translators: %s: app name. */
					ideatoapps_part( 'button', array( 'label' => sprintf( __( 'See %s', 'ideatoapps' ), get_the_title( $ideatoapps_app ) ), 'href' => get_permalink( $ideatoapps_app ) ) );
					?>
				</div>
			<?php endif; ?>
		</div>
	</article>
	<?php
}
get_footer();
