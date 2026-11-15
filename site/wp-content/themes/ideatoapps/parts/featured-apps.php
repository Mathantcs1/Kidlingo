<?php
/**
 * Featured apps grid. Absent when there is no visible app.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_apps = ideatoapps_featured_apps();
if ( ! $ideatoapps_apps ) {
	return;
}
?>
<section class="section" data-testid="featured-apps" aria-labelledby="featured-apps-title">
	<div class="container">
		<?php ideatoapps_part( 'section-heading', array( 'id' => 'featured-apps-title', 'eyebrow' => __( 'Apps', 'ideatoapps' ), 'title' => __( 'Featured apps', 'ideatoapps' ) ) ); ?>
		<div class="grid">
			<?php
			foreach ( $ideatoapps_apps as $ideatoapps_app ) {
				$ideatoapps_status = (string) get_post_meta( $ideatoapps_app->ID, 'delivery_status', true );
				$ideatoapps_price  = trim( (string) get_post_meta( $ideatoapps_app->ID, 'price_label', true ) );
				$ideatoapps_terms  = get_the_terms( $ideatoapps_app, 'app_category' );
				if ( 'coming_soon' === $ideatoapps_status ) {
					$ideatoapps_note = '<p class="card__note card__note--soon">' . esc_html__( 'Coming soon', 'ideatoapps' ) . '</p>';
				} else {
					$ideatoapps_note = '' !== $ideatoapps_price ? '<p class="card__note">' . esc_html( $ideatoapps_price ) . '</p>' : '';
				}
				ideatoapps_part(
					'card',
					array(
						'title'    => get_the_title( $ideatoapps_app ),
						'href'     => get_permalink( $ideatoapps_app ),
						'text'     => trim( (string) get_post_meta( $ideatoapps_app->ID, 'tagline', true ) ),
						'eyebrow'  => is_array( $ideatoapps_terms ) && $ideatoapps_terms ? $ideatoapps_terms[0]->name : '',
						'image_id' => (int) get_post_thumbnail_id( $ideatoapps_app ),
						'content'  => $ideatoapps_note,
					)
				);
			}
			?>
		</div>
	</div>
</section>
