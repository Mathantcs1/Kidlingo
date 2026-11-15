<?php
/**
 * Shared guards for the public REST forms: client IP, per-IP rate limit (transients) and the REST nonce check.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

const IDEATOAPPS_RATE_LIMIT_MAX    = 5;
const IDEATOAPPS_RATE_LIMIT_WINDOW = 60;

/**
 * The visitor's IP from REMOTE_ADDR only (X-Forwarded-For is client-controlled, so it is never trusted by default).
 * Behind a trusted proxy or CDN, a site owner can map the real address with the `ideatoapps_client_ip` filter.
 *
 * @return string
 */
function ideatoapps_client_ip() {
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) && is_string( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	$ip = (string) apply_filters( 'ideatoapps_client_ip', $ip );
	return false !== filter_var( $ip, FILTER_VALIDATE_IP ) ? $ip : '0.0.0.0';
}

/**
 * Transient key holding the current visitor's counter for a bucket (a hash, so no IP is stored in plain text).
 *
 * @param string $bucket Form name.
 * @return string
 */
function ideatoapps_rate_limit_key( $bucket ) {
	return 'ita_rl_' . sanitize_key( $bucket ) . '_' . md5( ideatoapps_client_ip() );
}

/**
 * Count this request and say whether the visitor is over the limit (5 requests per minute per IP, fixed window).
 *
 * @param string $bucket Form name.
 * @return bool True when this request must be refused with 429.
 */
function ideatoapps_rate_limit_exceeded( $bucket ) {
	$key   = ideatoapps_rate_limit_key( $bucket );
	$now   = time();
	$state = get_transient( $key );
	if ( ! is_array( $state ) || ! isset( $state['count'], $state['start'] ) || $now - (int) $state['start'] >= IDEATOAPPS_RATE_LIMIT_WINDOW ) {
		$state = array( 'count' => 0, 'start' => $now );
	}
	++$state['count'];
	set_transient( $key, $state, max( 1, IDEATOAPPS_RATE_LIMIT_WINDOW - ( $now - (int) $state['start'] ) ) );
	return $state['count'] > IDEATOAPPS_RATE_LIMIT_MAX;
}

/**
 * REST permission callback: the request must carry a valid `wp_rest` nonce in X-WP-Nonce. The page prints the nonce
 * with wp_create_nonce(); a page cached for longer than the nonce lifetime (12-24 h) must be refreshed to submit.
 *
 * @param WP_REST_Request $request Request.
 * @return true|WP_Error
 */
function ideatoapps_rest_check_nonce( $request ) {
	$nonce = $request->get_header( 'X-WP-Nonce' );
	if ( is_string( $nonce ) && '' !== $nonce && wp_verify_nonce( $nonce, 'wp_rest' ) ) {
		return true;
	}
	return new WP_Error( 'ideatoapps_bad_nonce', __( 'This form expired. Reload the page and try again.', 'ideatoapps-core' ), array( 'status' => 403 ) );
}

/**
 * Standard 429 error.
 *
 * @return WP_Error
 */
function ideatoapps_too_many_requests() {
	return new WP_Error( 'ideatoapps_rate_limited', __( 'Too many requests. Please wait a minute and try again.', 'ideatoapps-core' ), array( 'status' => 429 ) );
}
