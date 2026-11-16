<?php
/**
 * Signed, stateless links for the newsletter confirm and unsubscribe pages.
 *
 * Token = HMAC-SHA256 over "id|action|issued" keyed with wp_salt( 'auth' ). A confirm token is "issued.mac" and expires after
 * 7 days (the issue time is inside the MAC, so it cannot be edited). An unsubscribe token is the bare MAC and never expires.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

const IDEATOAPPS_NEWSLETTER_CONFIRM_TTL = 7 * DAY_IN_SECONDS;

/**
 * Keyed hash of one subscriber, action and issue time.
 *
 * @param int    $id     Subscriber post ID.
 * @param string $action confirm or unsubscribe.
 * @param string $issued Issue time (confirm) or empty (unsubscribe).
 * @return string 64 hex characters.
 */
function ideatoapps_newsletter_mac( $id, $action, $issued ) {
	return hash_hmac( 'sha256', (int) $id . '|' . $action . '|' . $issued, wp_salt( 'auth' ) );
}

/**
 * Make a token.
 *
 * @param int      $id     Subscriber post ID.
 * @param string   $action confirm or unsubscribe.
 * @param int|null $now    Issue time (tests).
 * @return string
 */
function ideatoapps_newsletter_token( $id, $action, $now = null ) {
	if ( 'confirm' === $action ) {
		$issued = (string) ( null === $now ? time() : (int) $now );
		return $issued . '.' . ideatoapps_newsletter_mac( $id, 'confirm', $issued );
	}
	return ideatoapps_newsletter_mac( $id, 'unsubscribe', '' );
}

/**
 * Check a token: ok, expired (genuine but older than 7 days) or invalid.
 *
 * @param int      $id     Subscriber post ID.
 * @param string   $action confirm or unsubscribe.
 * @param mixed    $token  Submitted token.
 * @param int|null $now    Current time (tests).
 * @return string
 */
function ideatoapps_newsletter_token_check( $id, $action, $token, $now = null ) {
	if ( ! is_string( $token ) || ! in_array( $action, array( 'confirm', 'unsubscribe' ), true ) ) {
		return 'invalid';
	}
	$now = null === $now ? time() : (int) $now;
	if ( 'confirm' === $action ) {
		if ( 1 !== preg_match( '/^(\d{1,12})\.([a-f0-9]{64})$/', $token, $m ) ) {
			return 'invalid';
		}
		if ( ! hash_equals( ideatoapps_newsletter_mac( $id, 'confirm', $m[1] ), $m[2] ) ) {
			return 'invalid';
		}
		$issued = (int) $m[1];
		if ( $issued > $now + 300 ) {
			return 'invalid';
		}
		return $now - $issued > IDEATOAPPS_NEWSLETTER_CONFIRM_TTL ? 'expired' : 'ok';
	}
	if ( 1 !== preg_match( '/^[a-f0-9]{64}$/', $token ) ) {
		return 'invalid';
	}
	return hash_equals( ideatoapps_newsletter_mac( $id, 'unsubscribe', '' ), $token ) ? 'ok' : 'invalid';
}

/**
 * Front-end page URL for a subscriber and action. The page changes nothing on GET.
 *
 * @param int    $id     Subscriber post ID.
 * @param string $action confirm or unsubscribe.
 * @return string
 */
function ideatoapps_newsletter_url( $id, $action ) {
	return add_query_arg(
		array(
			'ita_newsletter' => $action,
			'sid'            => (int) $id,
			't'              => ideatoapps_newsletter_token( $id, $action ),
		),
		home_url( '/' )
	);
}
