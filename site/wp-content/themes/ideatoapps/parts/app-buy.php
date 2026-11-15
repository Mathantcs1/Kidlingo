<?php
/**
 * Buy area: a buy button (live + linked product + WooCommerce), "Coming soon", and Launch / Watch demo links when set.
 * Absent when there is nothing to offer, so there is never a dead button. Checkout is handled by WooCommerce (Task 8).
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
$ideatoapps_buy   = ideatoapps_app_buy_state( $ideatoapps_app );
$ideatoapps_links = ideatoapps_app_action_links( $ideatoapps_app->ID );
if ( 'none' === $ideatoapps_buy['kind'] && ! $ideatoapps_links ) {
	return;
}
$ideatoapps_rel = array( 'rel' => 'noopener noreferrer' );
?>
<div class="buy" data-testid="buy-area">
	<?php if ( 'buy' === $ideatoapps_buy['kind'] ) : ?>
		<?php ideatoapps_part( 'button', array( 'label' => $ideatoapps_buy['label'], 'href' => $ideatoapps_buy['href'] ) ); ?>
	<?php elseif ( 'soon' === $ideatoapps_buy['kind'] ) : ?>
		<p class="buy__soon"><?php esc_html_e( 'Coming soon', 'ideatoapps' ); ?></p>
	<?php endif; ?>
	<?php if ( isset( $ideatoapps_links['launch'] ) ) : ?>
		<?php ideatoapps_part( 'button', array( 'label' => __( 'Launch', 'ideatoapps' ), 'href' => $ideatoapps_links['launch'], 'variant' => 'secondary', 'attrs' => $ideatoapps_rel ) ); ?>
	<?php endif; ?>
	<?php if ( isset( $ideatoapps_links['demo'] ) ) : ?>
		<?php ideatoapps_part( 'button', array( 'label' => __( 'Watch demo', 'ideatoapps' ), 'href' => $ideatoapps_links['demo'], 'variant' => 'secondary', 'attrs' => $ideatoapps_rel ) ); ?>
	<?php endif; ?>
</div>
