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
				ideatoapps_part( 'app-card', array( 'app' => $ideatoapps_app ) );
			}
			?>
		</div>
	</div>
</section>
