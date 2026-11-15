<?php
/**
 * Shared guards for the public REST forms: client IP, atomic per-IP rate limit, nonce refresh route and the REST nonce check.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

const IDEATOAPPS_RATE_LIMIT_MAX    = 5;
const IDEATOAPPS_RATE_LIMIT_WINDOW = 60;

/**
 * The visitor's IP from REMOTE_ADDR only. X-Forwarded-For and similar headers are client-controlled, so they are
 * never trusted by default (an attacker could rotate them to dodge the rate limit).
 *
 * Behind a trusted proxy or CDN every request shares the proxy's address, so the owner must map the real one with the
 * `ideatoapps_client_ip` filter, but only when REMOTE_ADDR really is that proxy. Example (mu-plugin or theme code):
 *
 *     add_filter( 'ideatoapps_client_ip', function ( $ip ) {
 *         $proxies = array( '203.0.113.10' ); // your proxy / CDN egress addresses.
 *         $fwd     = isset( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ? explode( ',', wp_unslash( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) : array();
 *         $client  = trim( (string) end( $fwd ) ); // the entry appended by YOUR proxy, not the first (spoofable) one.
 *         return in_array( $ip, $proxies, true ) && false !== filter_var( $client, FILTER_VALIDATE_IP ) ? $client : $ip;
 *     } );
 *
 * Whatever the filter returns is validated again here; anything that is not an IP falls back to 0.0.0.0. See
 * site/docs/ENVIRONMENT.md ("Client IP and the rate limit").
 *
 * @return string
 */
function ideatoapps_client_ip() {
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) && is_string( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	$ip = (string) apply_filters( 'ideatoapps_client_ip', $ip );
	return false !== filter_var( $ip, FILTER_VALIDATE_IP ) ? $ip : '0.0.0.0';
}

/**
 * Atomically add one to this visitor's counter for a bucket and window and return the new count. The row is created
 * with add_option() (unique option_name, so only one request creates it) and later requests do a single
 * `UPDATE ... option_value = option_value + 1` in SQL, then read the value straight from the database (never from a
 * cache). Counts only ever grow, so every reader sees at least its own number: of N parallel requests at most the
 * limit pass. With a persistent object cache, wp_cache_incr() is the atomic primitive instead.
 *
 * @param string $bucket Form name.
 * @param int    $window Window number (time() / window length).
 * @return int Count including this request.
 */
function ideatoapps_rate_limit_claim( $bucket, $window ) {
	global $wpdb;
	$name = 'ita_rl_' . sanitize_key( $bucket ) . '_' . md5( ideatoapps_client_ip() ) . '_' . (int) $window;
	if ( wp_using_ext_object_cache() ) {
		wp_cache_add( $name, 0, 'ideatoapps_rl', IDEATOAPPS_RATE_LIMIT_WINDOW * 2 );
		$count = wp_cache_incr( $name, 1, 'ideatoapps_rl' );
		if ( false !== $count ) {
			return (int) $count;
		}
	}
	if ( add_option( $name, '1', '', false ) ) {
		ideatoapps_rate_limit_purge( (int) $window - 1 );
		return 1;
	}
	$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->options} SET option_value = option_value + 1 WHERE option_name = %s", $name ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
	return (int) $wpdb->get_var( $wpdb->prepare( "SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", $name ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
}

/**
 * Delete counter rows of windows older than $oldest (they are useless after a minute), up to 200 per call.
 *
 * @param int $oldest Oldest window number to keep.
 */
function ideatoapps_rate_limit_purge( $oldest ) {
	global $wpdb;
	$names = $wpdb->get_col( "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'ita\\_rl\\_%' LIMIT 200" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
	foreach ( $names as $name ) {
		if ( (int) substr( $name, strrpos( $name, '_' ) + 1 ) < $oldest ) {
			delete_option( $name );
		}
	}
}

/**
 * Count this request and say whether the visitor is over the limit (5 requests per minute per IP, fixed window).
 *
 * @param string $bucket Form name.
 * @return bool True when this request must be refused with 429.
 */
function ideatoapps_rate_limit_exceeded( $bucket ) {
	return ideatoapps_rate_limit_claim( $bucket, (int) floor( time() / IDEATOAPPS_RATE_LIMIT_WINDOW ) ) > IDEATOAPPS_RATE_LIMIT_MAX;
}

/**
 * Is this request first-party? Only a request with no Origin header (same-origin GETs, navigations) or an Origin whose
 * host is this site's host may be authenticated from the login cookie. WordPress CORS replies echo the Origin with
 * credentials allowed, so a foreign page could otherwise read the visitor's real `wp_rest` nonce. The JSONP callback
 * (`_jsonp`) is a second cross-site way to read the response, so it is never first-party either.
 *
 * @param WP_REST_Request $request Request.
 * @return bool
 */
function ideatoapps_rest_is_first_party( $request ) {
	$jsonp = $request->get_param( '_jsonp' );
	if ( null !== $jsonp && '' !== $jsonp ) {
		return false;
	}
	$origin = $request->get_header( 'origin' );
	if ( null === $origin || '' === $origin ) {
		return true;
	}
	$host = wp_parse_url( (string) $origin, PHP_URL_HOST );
	$home = wp_parse_url( home_url(), PHP_URL_HOST );
	return is_string( $host ) && is_string( $home ) && 0 === strcasecmp( $host, $home );
}

/**
 * Fresh REST nonce for pages served from a cache (GET /ideatoapps/v1/nonce). Never cacheable. For a signed-in visitor
 * the cookie is checked here because REST drops the user when no nonce was sent, but only for first-party requests
 * (see ideatoapps_rest_is_first_party()); a foreign Origin or JSONP caller always gets the anonymous nonce.
 *
 * @param WP_REST_Request $request Request.
 * @return WP_REST_Response
 */
function ideatoapps_rest_nonce( $request ) {
	if ( ideatoapps_rest_is_first_party( $request ) ) {
		$uid = wp_validate_auth_cookie( '', 'logged_in' );
		if ( $uid ) {
			wp_set_current_user( $uid );
		}
	} else {
		wp_set_current_user( 0 );
	}
	$res = new WP_REST_Response( array( 'nonce' => wp_create_nonce( 'wp_rest' ) ), 200 );
	$res->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, private' );
	$res->header( 'Pragma', 'no-cache' );
	$res->header( 'Expires', 'Wed, 11 Jan 1984 05:00:00 GMT' );
	return $res;
}

/**
 * Register the nonce refresh route.
 */
function ideatoapps_register_nonce_route() {
	register_rest_route(
		'ideatoapps/v1',
		'/nonce',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'ideatoapps_rest_nonce',
			'permission_callback' => '__return_true',
		)
	);
}
add_action( 'rest_api_init', 'ideatoapps_register_nonce_route' );

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
