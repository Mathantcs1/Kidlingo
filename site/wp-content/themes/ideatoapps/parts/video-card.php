<?php
/**
 * A video on the Learn page: click-to-play frame, title (links to the video page), excerpt, related app.
 *
 * Args: video (WP_Post), show_app (bool, name the related app when it can be shown).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_video = $args['video'] ?? null;
if ( ! $ideatoapps_video instanceof WP_Post ) {
	return;
}
$ideatoapps_text = wp_trim_words( get_the_excerpt( $ideatoapps_video ), 28 );
$ideatoapps_app  = ! empty( $args['show_app'] ) ? ideatoapps_video_related_app( $ideatoapps_video->ID ) : null;
?>
<article class="video-card" data-testid="video-card">
	<?php ideatoapps_part( 'video-frame', array( 'video' => $ideatoapps_video ) ); ?>
	<h2 class="video-card__title"><a href="<?php echo esc_url( get_permalink( $ideatoapps_video ) ); ?>"><?php echo esc_html( get_the_title( $ideatoapps_video ) ); ?></a></h2>
	<?php if ( '' !== $ideatoapps_text ) : ?>
		<p class="video-card__text"><?php echo esc_html( $ideatoapps_text ); ?></p>
	<?php endif; ?>
	<?php if ( $ideatoapps_app ) : ?>
		<p class="video-card__app"><?php esc_html_e( 'About', 'ideatoapps' ); ?> <a href="<?php echo esc_url( get_permalink( $ideatoapps_app ) ); ?>"><?php echo esc_html( get_the_title( $ideatoapps_app ) ); ?></a></p>
	<?php endif; ?>
</article>
