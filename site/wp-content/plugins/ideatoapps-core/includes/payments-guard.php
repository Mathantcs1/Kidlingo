<?php
/**
 * Stripe is TEST MODE ONLY until the owner approves live payments. The WooCommerce Stripe gateway is hidden at checkout
 * whenever it is configured for live mode, unless wp-config.php defines IDEATOAPPS_ALLOW_LIVE_PAYMENTS as true (the owner
 * does that, and only after the go-live checklist in docs/STRIPE_SETUP.md). This code never reads, stores or logs keys or card data.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Whether the Stripe gateway is set to live mode.
 *
 * @return bool
 */
function ideatoapps_stripe_is_live(): bool {
	$settings = get_option( 'woocommerce_stripe_settings', array() );
	return is_array( $settings ) && isset( $settings['enabled'], $settings['testmode'] ) && 'yes' === $settings['enabled'] && 'yes' !== $settings['testmode'];
}

/**
 * Whether live payments were explicitly allowed.
 *
 * @return bool
 */
function ideatoapps_live_payments_allowed(): bool {
	return defined( 'IDEATOAPPS_ALLOW_LIVE_PAYMENTS' ) && true === IDEATOAPPS_ALLOW_LIVE_PAYMENTS;
}

/**
 * Hide Stripe gateways while Stripe is live and live payments are not allowed.
 *
 * @param array $gateways Available gateways.
 * @return array
 */
function ideatoapps_block_live_stripe( $gateways ) {
	if ( is_array( $gateways ) && ideatoapps_stripe_is_live() && ! ideatoapps_live_payments_allowed() ) {
		foreach ( array_keys( $gateways ) as $id ) {
			if ( 0 === strpos( (string) $id, 'stripe' ) ) {
				unset( $gateways[ $id ] );
			}
		}
	}
	return $gateways;
}
add_filter( 'woocommerce_available_payment_gateways', 'ideatoapps_block_live_stripe', 100 );

/**
 * Tell the admin why Stripe disappeared.
 */
function ideatoapps_live_stripe_notice(): void {
	if ( current_user_can( 'manage_options' ) && ideatoapps_stripe_is_live() && ! ideatoapps_live_payments_allowed() ) {
		echo '<div class="notice notice-error"><p>' . esc_html__( 'Stripe is in live mode, but this site is test-mode only until live payments are approved. The Stripe gateway is hidden at checkout. Switch Stripe to test mode, or see docs/STRIPE_SETUP.md before going live.', 'ideatoapps-core' ) . '</p></div>';
	}
}
add_action( 'admin_notices', 'ideatoapps_live_stripe_notice' );
