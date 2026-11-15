<?php
/**
 * Security headers that are always safe to send from PHP. The rest (HSTS, long cache lifetimes, the www redirect) belongs in
 * the web server config: see site/docs/HTACCESS_SNIPPET.md. No CSP is sent: it would need a per-site allow-list for Stripe.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Header name => value. Names and values are stripped of anything that could split the header.
 *
 * @return array<string, string>
 */
function ideatoapps_security_headers(): array {
	$headers = (array) apply_filters(
		'ideatoapps_security_headers',
		array(
			'X-Content-Type-Options' => 'nosniff',
			'Referrer-Policy'        => 'strict-origin-when-cross-origin',
			'X-Frame-Options'        => 'SAMEORIGIN',
		)
	);
	$clean   = array();
	foreach ( $headers as $name => $value ) {
		$name = (string) $name;
		if ( 1 === preg_match( '/^[A-Za-z0-9-]+$/', $name ) && is_scalar( $value ) ) {
			$clean[ $name ] = str_replace( array( "\r", "\n", "\0" ), '', (string) $value );
		}
	}
	return $clean;
}

function ideatoapps_send_security_headers(): void {
	foreach ( ideatoapps_security_headers() as $name => $value ) {
		header( $name . ': ' . $value );
	}
}
add_action( 'send_headers', 'ideatoapps_send_security_headers' );
