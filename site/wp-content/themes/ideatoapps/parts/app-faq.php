<?php
/**
 * FAQ as accessible details/summary accordions. Absent when the app has no FAQ.
 *
 * Args: app (WP_Post).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_app = $args['app'] ?? null;
$ideatoapps_faq = $ideatoapps_app instanceof WP_Post ? ideatoapps_app_faq( $ideatoapps_app->ID ) : array();
if ( ! $ideatoapps_faq ) {
	return;
}
?>
<section class="section app-section app-section--alt" data-testid="app-faq" aria-labelledby="app-faq-title">
	<div class="container">
		<h2 id="app-faq-title"><?php esc_html_e( 'Questions', 'ideatoapps' ); ?></h2>
		<div class="faq">
			<?php foreach ( $ideatoapps_faq as $ideatoapps_row ) : ?>
				<details class="faq__item">
					<summary><?php echo esc_html( $ideatoapps_row['q'] ); ?></summary>
					<div class="faq__answer"><p><?php echo wp_kses( nl2br( esc_html( $ideatoapps_row['a'] ) ), array( 'br' => array() ) ); ?></p></div>
				</details>
			<?php endforeach; ?>
		</div>
	</div>
</section>
