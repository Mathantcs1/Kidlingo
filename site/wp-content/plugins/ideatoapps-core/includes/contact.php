<?php
/**
 * Contact form: POST /wp-json/ideatoapps/v1/contact {name, email, message, website}. `website` is a honeypot.
 * Disabled (503) until the owner turns on option `ideatoapps_contact_enabled` (Settings > IdeaToApps) after
 * confirming a working mailbox. Mail goes to the WordPress admin email; no address is ever printed on the site.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Whether the contact form is switched on (default: no).
 *
 * @return bool
 */
function ideatoapps_contact_enabled() {
	return rest_sanitize_boolean( get_option( 'ideatoapps_contact_enabled', false ) );
}

/**
 * Permission callback: 503 while disabled (checked first), then the REST nonce.
 *
 * @param WP_REST_Request $request Request.
 * @return true|WP_Error
 */
function ideatoapps_contact_permission( $request ) {
	if ( ! ideatoapps_contact_enabled() ) {
		return new WP_Error( 'ideatoapps_contact_disabled', __( 'The contact form is not yet available.', 'ideatoapps-core' ), array( 'status' => 503 ) );
	}
	return ideatoapps_rest_check_nonce( $request );
}

/**
 * Register the route.
 */
function ideatoapps_register_contact_route() {
	register_rest_route(
		'ideatoapps/v1',
		'/contact',
		array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => 'ideatoapps_contact_send',
			'permission_callback' => 'ideatoapps_contact_permission',
		)
	);
}
add_action( 'rest_api_init', 'ideatoapps_register_contact_route' );

/**
 * Handle a message.
 *
 * @param WP_REST_Request $request Request.
 * @return WP_REST_Response|WP_Error
 */
function ideatoapps_contact_send( $request ) {
	$bad = static fn( $code, $text ) => new WP_Error( $code, $text, array( 'status' => 400 ) );

	$honeypot = $request->get_param( 'website' );
	if ( is_string( $honeypot ) ? '' !== trim( $honeypot ) : ! empty( $honeypot ) ) {
		return $bad( 'ideatoapps_spam', __( 'The message could not be sent.', 'ideatoapps-core' ) );
	}
	if ( ideatoapps_rate_limit_exceeded( 'contact' ) ) {
		return ideatoapps_too_many_requests();
	}

	$name    = sanitize_text_field( (string) ( is_scalar( $request->get_param( 'name' ) ) ? $request->get_param( 'name' ) : '' ) );
	$email   = sanitize_email( trim( (string) ( is_scalar( $request->get_param( 'email' ) ) ? $request->get_param( 'email' ) : '' ) ) );
	$message = trim( sanitize_textarea_field( (string) ( is_scalar( $request->get_param( 'message' ) ) ? $request->get_param( 'message' ) : '' ) ) );

	if ( '' === $name || mb_strlen( $name ) > 100 ) {
		return $bad( 'ideatoapps_bad_name', __( 'Enter your name (up to 100 characters).', 'ideatoapps-core' ) );
	}
	if ( '' === $email || ! is_email( $email ) ) {
		return $bad( 'ideatoapps_bad_email', __( 'Enter a valid email address.', 'ideatoapps-core' ) );
	}
	if ( '' === $message || mb_strlen( $message ) > 5000 ) {
		return $bad( 'ideatoapps_bad_message', __( 'Write a message (up to 5000 characters).', 'ideatoapps-core' ) );
	}

	$body = sprintf( "Name: %s\nEmail: %s\n\n%s\n", $name, $email, $message );
	// Reply-To carries only the validated address (no display name), so nothing typed in the form can add a header.
	$sent = wp_mail( (string) get_option( 'admin_email' ), '[IdeaToApps] New contact form message', $body, array( 'Reply-To: ' . $email, 'Content-Type: text/plain; charset=UTF-8' ) );
	if ( ! $sent ) {
		return new WP_Error( 'ideatoapps_mail_failed', __( 'The message could not be sent. Please try again later.', 'ideatoapps-core' ), array( 'status' => 500 ) );
	}
	return new WP_REST_Response( array( 'ok' => true, 'message' => __( 'Thanks, your message was sent.', 'ideatoapps-core' ) ), 200 );
}
