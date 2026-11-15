<?php
/**
 * Newsletter sign-up: POST /wp-json/ideatoapps/v1/newsletter {email, consent}. No mail service is connected, so
 * subscribers are stored locally (private `ita_subscriber` posts; the type name must stay within 20 characters) and the owner exports them as CSV
 * (Tools > Newsletter list, see newsletter-export.php). Nothing here sends email.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * A private, non-public post type; never exposed in REST, search or the front end.
 */
function ideatoapps_register_subscriber_post_type() {
	register_post_type(
		'ita_subscriber',
		array(
			'labels'              => array( 'name' => __( 'Subscribers', 'ideatoapps-core' ), 'singular_name' => __( 'Subscriber', 'ideatoapps-core' ) ),
			'public'              => false,
			'publicly_queryable'  => false,
			'exclude_from_search' => true,
			'show_ui'             => false,
			'show_in_rest'        => false,
			'show_in_menu'        => false,
			'rewrite'             => false,
			'query_var'           => false,
			'can_export'          => true,
			'supports'            => array( 'title' ),
		)
	);
}
add_action( 'init', 'ideatoapps_register_subscriber_post_type' );

/**
 * Turn the home newsletter part on: this plugin owns the route it posts to.
 *
 * @param bool $available Value so far.
 * @return bool
 */
function ideatoapps_newsletter_route_exists( $available ) {
	return $available || false !== has_action( 'rest_api_init', 'ideatoapps_register_newsletter_route' );
}
add_filter( 'ideatoapps_newsletter_available', 'ideatoapps_newsletter_route_exists' );

/**
 * Register the route. Nonce is checked in the permission callback; validation and the rate limit in the handler so
 * that every request which passes the nonce is counted, valid or not.
 */
function ideatoapps_register_newsletter_route() {
	register_rest_route(
		'ideatoapps/v1',
		'/newsletter',
		array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => 'ideatoapps_newsletter_subscribe',
			'permission_callback' => 'ideatoapps_rest_check_nonce',
		)
	);
}
add_action( 'rest_api_init', 'ideatoapps_register_newsletter_route' );

/**
 * Find a stored subscriber by (lower-case) email.
 *
 * @param string $email Email.
 * @return int Post ID or 0.
 */
function ideatoapps_find_subscriber( $email ) {
	$found = get_posts(
		array(
			'post_type'      => 'ita_subscriber',
			'post_status'    => 'any',
			'posts_per_page' => 1,
			'fields'         => 'ids',
			'no_found_rows'  => true,
			'meta_key'       => 'email', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- one lookup per sign-up.
			'meta_value'     => $email, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
		)
	);
	return $found ? (int) $found[0] : 0;
}

/**
 * Handle a sign-up.
 *
 * @param WP_REST_Request $request Request.
 * @return WP_REST_Response|WP_Error
 */
function ideatoapps_newsletter_subscribe( $request ) {
	if ( ideatoapps_rate_limit_exceeded( 'newsletter' ) ) {
		return ideatoapps_too_many_requests();
	}
	$raw     = $request->get_param( 'email' );
	$email   = is_string( $raw ) ? strtolower( trim( $raw ) ) : '';
	$consent = rest_sanitize_boolean( $request->get_param( 'consent' ) );
	// Validate what was typed (sanitize_email would quietly turn "<b>@x.com" into a valid-looking address).
	if ( '' === $email || ! is_email( $email ) || sanitize_email( $email ) !== $email ) {
		return new WP_Error( 'ideatoapps_bad_email', __( 'Enter a valid email address.', 'ideatoapps-core' ), array( 'status' => 400 ) );
	}
	if ( ! $consent ) {
		return new WP_Error( 'ideatoapps_no_consent', __( 'Please tick the box to agree before joining the list.', 'ideatoapps-core' ), array( 'status' => 400 ) );
	}
	if ( 0 === ideatoapps_find_subscriber( $email ) ) {
		$id = wp_insert_post(
			array(
				'post_type'   => 'ita_subscriber',
				'post_status' => 'private',
				'post_title'  => $email,
				'meta_input'  => array(
					'email'      => $email,
					'consent_at' => gmdate( 'c' ),
				),
			),
			true
		);
		if ( is_wp_error( $id ) ) {
			return new WP_Error( 'ideatoapps_store_failed', __( 'Something went wrong. Please try again later.', 'ideatoapps-core' ), array( 'status' => 500 ) );
		}
	}
	// Same answer for a new and an already-listed address, so the form cannot be used to probe the list.
	return new WP_REST_Response( array( 'ok' => true, 'message' => __( 'Thanks, you are on the list.', 'ideatoapps-core' ) ), 200 );
}
