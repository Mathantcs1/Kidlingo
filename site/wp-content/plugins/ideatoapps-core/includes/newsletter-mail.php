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
 * Send the confirmation now. Success starts the 10-minute throttle and clears the failure notice; failure leaves the row
 * pending, starts no throttle and is counted (never with the address).
 *
 * @param int $id Post ID.
 * @return bool
 */
function ideatoapps_newsletter_send_confirmation( $id ) {
	$email = (string) get_post_meta( $id, 'email', true );
	$sent  = is_email( $email ) && ideatoapps_with_sender( static fn() => wp_mail( $email, __( 'Confirm your IdeaToApps newsletter sign-up', 'ideatoapps-core' ), ideatoapps_newsletter_confirmation_body( $id ), array( 'Content-Type: text/plain; charset=UTF-8' ) ) );
	if ( $sent ) {
		update_post_meta( $id, 'confirmation_sent_at', time() );
		delete_option( 'ideatoapps_newsletter_mail_failures' );
		return true;
	}
	ideatoapps_newsletter_record_failure();
	return false;
}

/**
 * Count one failed confirmation (never with the address).
 */
function ideatoapps_newsletter_record_failure() {
	update_option( 'ideatoapps_newsletter_mail_failures', (int) get_option( 'ideatoapps_newsletter_mail_failures', 0 ) + 1, false );
	update_option( 'ideatoapps_newsletter_mail_failed_at', gmdate( 'c' ), false );
}

/**
 * Queue a confirmation to go out after the response has been sent, so the sign-up answer is identical (and equally fast)
 * whatever the list state or the mail result.
 *
 * @param int $id Post ID.
 */
function ideatoapps_newsletter_queue_confirmation( $id ) {
	$GLOBALS['ideatoapps_newsletter_queue'][] = (int) $id;
	if ( false === has_action( 'shutdown', 'ideatoapps_newsletter_flush_queue' ) ) {
		add_action( 'shutdown', 'ideatoapps_newsletter_flush_queue' );
	}
}

/**
 * Shutdown hook: finish the HTTP response if the server lets us (PHP-FPM, LiteSpeed), then send the queued mails.
 */
function ideatoapps_newsletter_flush_queue() {
	$ids = array_unique( (array) ( $GLOBALS['ideatoapps_newsletter_queue'] ?? array() ) );
	$GLOBALS['ideatoapps_newsletter_queue'] = array();
	if ( ! $ids ) {
		return;
	}
	if ( function_exists( 'fastcgi_finish_request' ) ) {
		fastcgi_finish_request();
	} elseif ( function_exists( 'litespeed_finish_request' ) ) {
		litespeed_finish_request();
	}
	ignore_user_abort( true );
	foreach ( $ids as $id ) {
		try {
			ideatoapps_newsletter_send_confirmation( $id );
		} catch ( \Throwable $e ) { // a broken mailer must not stop the other queued mails; the message may hold an address, so only count it.
			ideatoapps_newsletter_record_failure();
		}
	}
}

/**
 * Admin notice text when confirmation emails have failed since the last successful one ('' when none). No address in it.
 *
 * @return string
 */
function ideatoapps_newsletter_mail_failure_notice() {
	$n = (int) get_option( 'ideatoapps_newsletter_mail_failures', 0 );
	if ( $n < 1 ) {
		return '';
	}
	/* translators: 1: number of failed confirmation emails, 2: time of the last failure. */
	return sprintf( __( '%1$d newsletter confirmation email(s) could not be sent since the last one that worked (last failure: %2$s). Those people stay "pending" and can sign up again. Check that the site can send mail (a sender mailbox, SPF/DKIM/DMARC).', 'ideatoapps-core' ), $n, (string) get_option( 'ideatoapps_newsletter_mail_failed_at', '' ) );
}
