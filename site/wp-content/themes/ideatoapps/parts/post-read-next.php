<?php
/**
 * "Read next": up to three other posts as cards (nothing when there are none).
 *
 * Args: post_id (int).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_next = ideatoapps_read_next( (int) ( $args['post_id'] ?? 0 ), 3 );
if ( ! $ideatoapps_next ) {
	return;
}
?>
<section class="post-next" data-testid="post-read-next" aria-labelledby="post-next-title">
	<h2 id="post-next-title"><?php esc_html_e( 'Read next', 'ideatoapps' ); ?></h2>
	<div class="grid">
		<?php
		foreach ( $ideatoapps_next as $ideatoapps_other ) {
			ideatoapps_part(
				'card',
				array(
					'title'    => get_the_title( $ideatoapps_other ),
					'href'     => get_permalink( $ideatoapps_other ),
					/* translators: 1: post date, 2: minutes to read. */
					'eyebrow'  => sprintf( __( '%1$s · %2$d min read', 'ideatoapps' ), get_the_date( '', $ideatoapps_other ), ideatoapps_reading_minutes( $ideatoapps_other->ID ) ),
					'text'     => wp_trim_words( wp_strip_all_tags( get_the_excerpt( $ideatoapps_other ) ), 24 ),
					'image_id' => (int) get_post_thumbnail_id( $ideatoapps_other ),
					'hero_html' => ideatoapps_card_hero( $ideatoapps_other ),
					'heading'  => 3,
				)
			);
		}
		?>
	</div>
</section>
