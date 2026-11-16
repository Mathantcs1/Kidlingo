<?php
/**
 * The one email this site sends for the newsletter: the plain-text confirmation. From address is WordPress's default
 * (or whatever the owner configured); no tracking, no images, no List-Unsubscribe header (no bulk mail is sent).
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

const IDEATOAPPS_NEWSLETTER_RESEND_AFTER = 10 * MINUTE_IN_SECONDS;

/**
 * Whether a pending subscriber may be sent another confirmation (none in the last 10 minutes).
 *
 * @param int $id Post ID.
 * @return bool
 */
function ideatoapps_newsletter_may_resend( $id ) {
	return time() - (int) get_post_meta( $id, 'confirmation_sent_at', true ) >= IDEATOAPPS_NEWSLETTER_RESEND_AFTER;
}

/**
 * Body text of the confirmation email.
 *
 * @param int $id Post ID.
 * @return string
 */
function ideatoapps_newsletter_confirmation_body( $id ) {
	$lines = array(
		__( 'Someone (hopefully you) asked to join the IdeaToApps newsletter list with this email address.', 'ideatoapps-core' ),
		__( 'Nothing is added to the list until you confirm.', 'ideatoapps-core' ),
		'',
		__( 'To confirm, open this link and press the Confirm button (the link works for 7 days):', 'ideatoapps-core' ),
		ideatoapps_newsletter_url( $id, 'confirm' ),
		'',
		__( 'If you did not ask for this, ignore this email: nothing happens unless you confirm.', 'ideatoapps-core' ),
		'',
		__( 'To unsubscribe, or to have your address deleted, open this link:', 'ideatoapps-core' ),
		ideatoapps_newsletter_url( $id, 'unsubscribe' ),
	);
	return implode( "\n", $lines ) . "\n";
}

/**
 * Send the confirmation and, only when it was accepted for delivery, start the 10-minute throttle.
 *
 * @param int $id Post ID.
 * @return bool
 */
function ideatoapps_newsletter_send_confirmation( $id ) {
	$email = (string) get_post_meta( $id, 'email', true );
	$sent  = is_email( $email ) && wp_mail( $email, __( 'Confirm your IdeaToApps newsletter sign-up', 'ideatoapps-core' ), ideatoapps_newsletter_confirmation_body( $id ), array( 'Content-Type: text/plain; charset=UTF-8' ) );
	if ( $sent ) {
		update_post_meta( $id, 'confirmation_sent_at', time() );
	}
	return (bool) $sent;
}
