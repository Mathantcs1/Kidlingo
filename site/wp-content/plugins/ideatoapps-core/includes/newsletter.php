<?php
/**
 * Newsletter sign-up: POST /wp-json/ideatoapps/v1/newsletter {email, consent}. Double opt-in: a sign-up is stored as `pending`
 * (private `ita_subscriber` posts; the type name must stay within 20 characters) and the only email ever sent is the confirmation
 * (newsletter-mail.php). The subscriber confirms or unsubscribes on a front-end page (newsletter-page.php); the owner exports
 * the confirmed rows as CSV (newsletter-export.php). Disabled (503) until option `ideatoapps_newsletter_enabled` is turned on
 * (Settings > IdeaToApps). This plugin sends no marketing email and has no composer.
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
			'can_export'          => false, // the confirmed-only CSV (newsletter-export.php) is the only export; WXR would dump every address.
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
 * Register the route. While the switch is off: 503 (checked first). Then the nonce; validation and the rate limit are in the
 * handler so that every request which passes the nonce is counted, valid or not.
 */
function ideatoapps_register_newsletter_route() {
	register_rest_route(
		'ideatoapps/v1',
		'/newsletter',
		array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => 'ideatoapps_newsletter_subscribe',
			'permission_callback' => 'ideatoapps_newsletter_permission',
		)
	);
}
add_action( 'rest_api_init', 'ideatoapps_register_newsletter_route' );

/**
 * Permission callback: 503 while disabled, then the REST nonce.
 *
 * @param WP_REST_Request $request Request.
 * @return true|WP_Error
 */
function ideatoapps_newsletter_permission( $request ) {
	if ( ! ideatoapps_newsletter_enabled() ) {
		return new WP_Error( 'ideatoapps_newsletter_disabled', __( 'The newsletter sign-up is not yet available.', 'ideatoapps-core' ), array( 'status' => 503 ) );
	}
	return ideatoapps_rest_check_nonce( $request );
}

/**
 * Handle a sign-up. The answer is the same for a new, a pending and a confirmed address, so the form cannot be used to probe
 * the list. A new address is stored pending; an unsubscribed one stays unsubscribed (a re-subscribe request is recorded) until its
 * owner confirms; a pending one is re-sent a confirmation at most once per 10 minutes; a confirmed one gets nothing. The
 * confirmation is mailed after the response is sent, so timing and status cannot reveal which case it was.
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
	$id     = ideatoapps_find_subscriber( $email );
	$status = $id ? ideatoapps_subscriber_status( $id ) : '';
	if ( ! $id ) {
		$id = wp_insert_post(
			array(
				'post_type'   => 'ita_subscriber',
				'post_status' => 'private',
				'post_title'  => $email,
				'meta_input'  => array(
					'email'      => $email,
					'consent_at' => gmdate( 'c' ),
					'status'     => 'pending',
					// Marketing consent on its own flag (the box above is required, so always 1 today). The CSV export skips rows with
					// 0, so a future reading-only sign-up (see DEPLOYMENT_BLUEHOST.md, gate G1 note) can never reach the newsletter.
					'newsletter_consent' => 1,
				),
			),
			true
		);
		if ( is_wp_error( $id ) ) {
			return new WP_Error( 'ideatoapps_store_failed', __( 'Something went wrong. Please try again later.', 'ideatoapps-core' ), array( 'status' => 500 ) );
		}
		$send = true;
	} elseif ( 'unsubscribed' === $status ) {
		// A stranger must not be able to re-list an opted-out address: it stays unsubscribed until its owner confirms.
		update_post_meta( $id, 'resubscribe_requested_at', gmdate( 'c' ) );
		$send = ideatoapps_newsletter_may_resend( $id );
	} else {
		$send = 'pending' === $status && ideatoapps_newsletter_may_resend( $id );
	}
	if ( $send ) {
		ideatoapps_newsletter_queue_confirmation( (int) $id ); // sent after the response, so every case answers alike.
	}
	return new WP_REST_Response( array( 'ok' => true, 'message' => __( 'Thanks. If this address needs confirming, we have emailed it a link. Your sign-up only counts once you click it.', 'ideatoapps-core' ) ), 200 );
}
