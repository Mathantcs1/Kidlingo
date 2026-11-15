<?php
/**
 * Other live apps. Absent when there are none (never an empty heading).
 *
 * Args: app (WP_Post).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_app     = $args['app'] ?? null;
$ideatoapps_related = $ideatoapps_app instanceof WP_Post ? ideatoapps_related_apps( $ideatoapps_app->ID ) : array();
if ( ! $ideatoapps_related ) {
	return;
}
?>
<section class="section app-section app-section--alt" data-testid="related-apps" aria-labelledby="related-apps-title">
	<div class="container">
		<h2 id="related-apps-title"><?php esc_html_e( 'More apps', 'ideatoapps' ); ?></h2>
		<div class="grid">
			<?php foreach ( $ideatoapps_related as $ideatoapps_other ) : ?>
				<?php ideatoapps_part( 'app-card', array( 'app' => $ideatoapps_other ) ); ?>
			<?php endforeach; ?>
		</div>
	</div>
</section>
