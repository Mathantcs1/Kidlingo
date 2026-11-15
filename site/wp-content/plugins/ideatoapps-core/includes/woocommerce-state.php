<?php
/**
 * Whether WooCommerce is available. One place to ask, so the theme and the seed agree (and tests can force "off").
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Whether WooCommerce is active and loaded.
 *
 * @return bool
 */
function ideatoapps_woocommerce_active() {
	return (bool) apply_filters( 'ideatoapps_woocommerce_active', class_exists( 'WooCommerce' ) );
}
