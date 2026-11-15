<?php
/**
 * "What's new": version number, release date and changelog for each version. Never a file name or download URL.
 *
 * Args: app (WP_Post).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_app      = $args['app'] ?? null;
$ideatoapps_versions = $ideatoapps_app instanceof WP_Post ? ideatoapps_public_versions( $ideatoapps_app->ID ) : array();
if ( ! $ideatoapps_versions ) {
	return;
}
?>
<section class="section app-section" data-testid="app-whats-new" aria-labelledby="app-whats-new-title">
	<div class="container">
		<h2 id="app-whats-new-title"><?php echo esc_html__( "What's new", 'ideatoapps' ); ?></h2>
		<ol class="versions">
			<?php foreach ( $ideatoapps_versions as $ideatoapps_i => $ideatoapps_version ) : ?>
				<?php
				$ideatoapps_time = strtotime( $ideatoapps_version['released'] );
				$ideatoapps_log  = array_filter( array_map( 'trim', preg_split( '/\R/', $ideatoapps_version['changelog'] ) ?: array() ), 'strlen' );
				?>
				<li class="versions__item" data-testid="version">
					<h3 class="versions__title">
						<?php /* translators: %s: version number such as 1.2.0. */ echo esc_html( sprintf( __( 'Version %s', 'ideatoapps' ), $ideatoapps_version['version'] ) ); ?>
						<?php if ( 0 === $ideatoapps_i ) : ?>
							<span class="versions__latest"><?php esc_html_e( 'Latest', 'ideatoapps' ); ?></span>
						<?php endif; ?>
					</h3>
					<?php if ( $ideatoapps_time ) : ?>
						<p class="versions__date"><time datetime="<?php echo esc_attr( gmdate( 'Y-m-d', $ideatoapps_time ) ); ?>"><?php echo esc_html( wp_date( get_option( 'date_format' ), $ideatoapps_time ) ); ?></time></p>
					<?php endif; ?>
					<?php foreach ( $ideatoapps_log as $ideatoapps_line ) : ?>
						<p class="versions__log"><?php echo esc_html( $ideatoapps_line ); ?></p>
					<?php endforeach; ?>
				</li>
			<?php endforeach; ?>
		</ol>
	</div>
</section>
