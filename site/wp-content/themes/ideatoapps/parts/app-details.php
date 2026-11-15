<?php
/**
 * Features list and requirements (platforms plus the editor's notes). Each block is absent when empty.
 *
 * Args: app (WP_Post).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_app = $args['app'] ?? null;
if ( ! $ideatoapps_app instanceof WP_Post ) {
	return;
}
$ideatoapps_features  = ideatoapps_app_features( $ideatoapps_app->ID );
$ideatoapps_platforms = trim( (string) get_post_meta( $ideatoapps_app->ID, 'platforms', true ) );
$ideatoapps_notes     = '' !== trim( wp_strip_all_tags( $ideatoapps_app->post_content ) ) ? (string) apply_filters( 'the_content', $ideatoapps_app->post_content ) : '';
if ( ! $ideatoapps_features && '' === $ideatoapps_platforms && '' === $ideatoapps_notes ) {
	return;
}
?>
<div class="section app-section">
	<div class="container app-details">
		<?php if ( $ideatoapps_features ) : ?>
			<section data-testid="app-features" aria-labelledby="app-features-title">
				<h2 id="app-features-title"><?php esc_html_e( 'What you get', 'ideatoapps' ); ?></h2>
				<ul class="feature-list">
					<?php foreach ( $ideatoapps_features as $ideatoapps_feature ) : ?>
						<li><?php echo esc_html( $ideatoapps_feature ); ?></li>
					<?php endforeach; ?>
				</ul>
			</section>
		<?php endif; ?>
		<?php if ( '' !== $ideatoapps_platforms || '' !== $ideatoapps_notes ) : ?>
			<section class="requirements" data-testid="app-requirements" aria-labelledby="app-requirements-title">
				<h2 id="app-requirements-title"><?php esc_html_e( 'Requirements', 'ideatoapps' ); ?></h2>
				<?php if ( '' !== $ideatoapps_platforms ) : ?>
					<dl class="spec">
						<dt><?php esc_html_e( 'Platforms', 'ideatoapps' ); ?></dt>
						<dd><?php echo esc_html( $ideatoapps_platforms ); ?></dd>
					</dl>
				<?php endif; ?>
				<?php echo wp_kses_post( $ideatoapps_notes ); ?>
			</section>
		<?php endif; ?>
	</div>
</div>
