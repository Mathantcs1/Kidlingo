<?php
/**
 * Watch & Learn. Needs at least one published video; links the channel only when its URL is set.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_videos = ideatoapps_home_videos();
if ( ! $ideatoapps_videos ) {
	return;
}
$ideatoapps_channel = ideatoapps_youtube_channel_url();
?>
<section class="section" data-testid="watch-learn" aria-labelledby="watch-learn-title">
	<div class="container">
		<?php ideatoapps_part( 'section-heading', array( 'id' => 'watch-learn-title', 'eyebrow' => __( 'Watch & Learn', 'ideatoapps' ), 'title' => __( 'See the apps at work', 'ideatoapps' ) ) ); ?>
		<div class="grid">
			<?php
			foreach ( $ideatoapps_videos as $ideatoapps_video ) {
				ideatoapps_part(
					'card',
					array(
						'title'       => get_the_title( $ideatoapps_video ),
						'href'        => get_permalink( $ideatoapps_video ),
						'text'        => wp_trim_words( get_the_excerpt( $ideatoapps_video ), 24 ),
						'image_id'    => (int) get_post_thumbnail_id( $ideatoapps_video ),
						'placeholder' => 'play',
					)
				);
			}
			?>
		</div>
		<div class="section-actions">
			<?php ideatoapps_part( 'button', array( 'label' => __( 'All videos', 'ideatoapps' ), 'href' => home_url( '/learn/' ), 'variant' => 'secondary' ) ); ?>
			<?php
			if ( '' !== $ideatoapps_channel ) {
				ideatoapps_part( 'button', array( 'label' => __( 'Visit our YouTube channel', 'ideatoapps' ), 'href' => $ideatoapps_channel, 'variant' => 'ghost', 'attrs' => array( 'rel' => 'noopener noreferrer' ) ) );
			}
			?>
		</div>
	</div>
</section>
