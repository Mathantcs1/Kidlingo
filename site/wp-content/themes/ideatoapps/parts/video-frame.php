<?php
/**
 * The click-to-play area of a video. The initial HTML holds only a button (and the poster image, if one is set):
 * no iframe and no request to YouTube. assets/js/video-player.js builds the youtube-nocookie.com iframe on click.
 * A <noscript> "Watch on YouTube" link covers visitors without JavaScript.
 *
 * Args: video (WP_Post).
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
$ideatoapps_yt = (string) get_post_meta( $ideatoapps_video->ID, 'youtube_id', true );
if ( 1 !== preg_match( '/^[A-Za-z0-9_-]{11}$/D', $ideatoapps_yt ) ) {
	return;
}
$ideatoapps_title = get_the_title( $ideatoapps_video );
$ideatoapps_image = (int) get_post_thumbnail_id( $ideatoapps_video ) > 0 ? wp_get_attachment_image( (int) get_post_thumbnail_id( $ideatoapps_video ), 'medium_large', false, array( 'loading' => 'lazy', 'decoding' => 'async', 'alt' => '' ) ) : '';
?>
<div class="video-frame" data-video-frame>
	<?php if ( '' !== $ideatoapps_image ) : ?>
		<div class="video-frame__poster"><?php echo $ideatoapps_image; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- core attachment markup. ?></div>
	<?php endif; ?>
	<button type="button" class="video-play" data-youtube-id="<?php echo esc_attr( $ideatoapps_yt ); ?>" data-video-title="<?php echo esc_attr( $ideatoapps_title ); ?>" aria-label="<?php echo esc_attr( sprintf( /* translators: %s: video title. */ __( 'Play video: %s', 'ideatoapps' ), $ideatoapps_title ) ); ?>">
		<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l11-6.5z"/></svg>
	</button>
	<?php // Without JavaScript the button does nothing. This plain link only exists then; it loads nothing from YouTube until it is followed. ?>
	<noscript><a class="video-fallback" href="<?php echo esc_url( 'https://www.youtube.com/watch?v=' . $ideatoapps_yt ); ?>" rel="noopener noreferrer"><?php echo esc_html( sprintf( /* translators: %s: video title. */ __( 'Watch on YouTube: %s', 'ideatoapps' ), $ideatoapps_title ) ); ?></a></noscript>
</div>
