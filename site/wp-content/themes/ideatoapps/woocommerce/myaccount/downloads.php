<?php
/**
 * My library (My account > Downloads): every version the customer may download, newest first, with its changelog and a
 * download button. Overrides woocommerce/myaccount/downloads.php.
 *
 * @package IdeaToApps
 * @version 7.8.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_items = ideatoapps_library_items( (array) WC()->customer->get_downloadable_products() );

do_action( 'woocommerce_before_account_downloads', (bool) $ideatoapps_items );
?>
<div class="library" data-testid="library">
<?php if ( ! $ideatoapps_items ) : ?>
	<div class="library__empty" data-testid="library-empty">
		<h2 class="library__empty-title"><?php esc_html_e( 'No purchases yet', 'ideatoapps' ); ?></h2>
		<p><?php esc_html_e( 'When you buy an app, every version of it shows up here for you to download.', 'ideatoapps' ); ?></p>
		<?php ideatoapps_part( 'button', array( 'label' => __( 'Explore apps', 'ideatoapps' ), 'href' => home_url( '/apps/' ) ) ); ?>
	</div>
<?php else : ?>
	<?php foreach ( $ideatoapps_items as $ideatoapps_app ) : ?>
		<section class="library__app" data-testid="library-app" aria-label="<?php echo esc_attr( $ideatoapps_app['title'] ); ?>">
			<h2 class="library__app-title">
				<?php if ( '' !== $ideatoapps_app['url'] ) : ?>
					<a href="<?php echo esc_url( $ideatoapps_app['url'] ); ?>"><?php echo esc_html( $ideatoapps_app['title'] ); ?></a>
				<?php else : ?>
					<?php echo esc_html( $ideatoapps_app['title'] ); ?>
				<?php endif; ?>
			</h2>
			<ol class="library__versions">
				<?php foreach ( $ideatoapps_app['versions'] as $ideatoapps_i => $ideatoapps_version ) : ?>
					<?php
					$ideatoapps_time  = strtotime( $ideatoapps_version['released'] );
					$ideatoapps_label = '' !== $ideatoapps_version['version'] ? $ideatoapps_version['version'] : $ideatoapps_version['name'];
					$ideatoapps_log   = array_filter( array_map( 'trim', preg_split( '/\R/', $ideatoapps_version['changelog'] ) ?: array() ), 'strlen' );
					?>
					<li class="library__version" data-testid="library-version">
						<div class="library__info">
							<h3 class="library__version-title">
								<?php /* translators: %s: version number such as 1.2.0. */ echo esc_html( sprintf( __( 'Version %s', 'ideatoapps' ), $ideatoapps_label ) ); ?>
								<?php if ( 0 === $ideatoapps_i ) : ?>
									<span class="versions__latest"><?php esc_html_e( 'Latest', 'ideatoapps' ); ?></span>
								<?php endif; ?>
							</h3>
							<?php if ( $ideatoapps_time ) : ?>
								<p class="library__date"><time datetime="<?php echo esc_attr( gmdate( 'Y-m-d', $ideatoapps_time ) ); ?>"><?php echo esc_html( wp_date( get_option( 'date_format' ), $ideatoapps_time ) ); ?></time></p>
							<?php endif; ?>
							<?php foreach ( $ideatoapps_log as $ideatoapps_line ) : ?>
								<p class="library__log"><?php echo esc_html( $ideatoapps_line ); ?></p>
							<?php endforeach; ?>
						</div>
						<?php
						ideatoapps_part(
							'button',
							array(
								'label' => sprintf( /* translators: %s: version number. */ __( 'Download %s', 'ideatoapps' ), $ideatoapps_label ),
								'href'  => $ideatoapps_version['url'],
								'attrs' => array(
									'data-testid' => 'download-button',
									/* translators: 1: version number, 2: app title. The visible text "Download 1.2.0" stays inside this name. */
									'aria-label'  => sprintf( __( 'Download %1$s of %2$s', 'ideatoapps' ), $ideatoapps_label, $ideatoapps_app['title'] ),
								),
							)
						);
						?>
					</li>
				<?php endforeach; ?>
			</ol>
		</section>
	<?php endforeach; ?>
<?php endif; ?>
</div>
<?php do_action( 'woocommerce_after_account_downloads', (bool) $ideatoapps_items ); ?>
