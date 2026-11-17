<?php
/**
 * The reader cookie of subscriber-only posts: `ita_reader` = "sid.expires.mac", where mac = HMAC-SHA256 over
 * "ideatoapps-reader|sid|expires" keyed with wp_salt( 'auth' ) (a prefix of its own, so no newsletter token can pass as one).
 * HttpOnly, SameSite=Lax, Secure on HTTPS, path /, 180 days.
 *
 * Every check also needs the subscriber to exist and still be `confirmed` (one lookup by primary key, then the cached meta), so
 * unsubscribing or erasing the address locks access at once. The cookie is set only by the POST that confirms a sign-up
 * (newsletter-page.php) and by the POST on a reading-link page (reader-link-page.php); never by a GET.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

const IDEATOAPPS_READER_COOKIE = 'ita_reader';
const IDEATOAPPS_READER_TTL    = 180 * DAY_IN_SECONDS;

/**
 * Keyed hash of one subscriber id and expiry.
 *
 * @param int $sid     Subscriber post ID.
 * @param int $expires Unix time.
 * @return string 64 hex characters.
 */
function ideatoapps_reader_mac( int $sid, int $expires ): string {
	return hash_hmac( 'sha256', 'ideatoapps-reader|' . $sid . '|' . $expires, wp_salt( 'auth' ) );
}

/**
 * A cookie value for a subscriber, valid for 180 days from $now.
 *
 * @param int      $sid Subscriber post ID.
 * @param int|null $now Current time (tests).
 */
function ideatoapps_reader_cookie_value( int $sid, ?int $now = null ): string {
	$expires = ( null === $now ? time() : $now ) + IDEATOAPPS_READER_TTL;
	return $sid . '.' . $expires . '.' . ideatoapps_reader_mac( $sid, $expires );
}

/**
 * The confirmed subscriber a cookie value stands for, or 0: bad format, wrong signature, expired, an expiry further ahead than
 * the lifetime, a missing row, a row of another type, or a subscriber that is not confirmed (pending, unsubscribed).
 *
 * @param mixed    $value Cookie value.
 * @param int|null $now   Current time (tests).
 */
function ideatoapps_reader_cookie_subscriber( $value, ?int $now = null ): int {
	if ( ! is_string( $value ) || 1 !== preg_match( '/^([1-9]\d{0,18})\.(\d{1,12})\.([a-f0-9]{64})\z/', $value, $m ) ) {
		return 0;
	}
	$now     = null === $now ? time() : $now;
	$sid     = (int) $m[1];
	$expires = (int) $m[2];
	if ( ! hash_equals( ideatoapps_reader_mac( $sid, $expires ), $m[3] ) ) {
		return 0;
	}
	if ( $expires < $now || $expires > $now + IDEATOAPPS_READER_TTL + 300 ) {
		return 0;
	}
	if ( 'ita_subscriber' !== get_post_type( $sid ) || 'confirmed' !== ideatoapps_subscriber_status( $sid ) ) {
		return 0;
	}
	return $sid;
}

/**
 * The confirmed subscriber of the current request's cookie, or 0.
 */
function ideatoapps_reader_current_subscriber(): int {
	if ( ! isset( $_COOKIE[ IDEATOAPPS_READER_COOKIE ] ) || ! is_string( $_COOKIE[ IDEATOAPPS_READER_COOKIE ] ) ) {
		return 0;
	}
	return ideatoapps_reader_cookie_subscriber( sanitize_text_field( wp_unslash( $_COOKIE[ IDEATOAPPS_READER_COOKIE ] ) ) );
}

/**
 * Cookie attributes.
 *
 * @param int $expires Unix time.
 * @return array{expires:int, path:string, domain:string, secure:bool, httponly:bool, samesite:string}
 */
function ideatoapps_reader_cookie_options( int $expires ): array {
	return array(
		'expires'  => $expires,
		'path'     => '/',
		'domain'   => '',
		'secure'   => is_ssl(),
		'httponly' => true,
		'samesite' => 'Lax',
	);
}

/**
 * Send the cookie for a subscriber. Callers: the confirming POST and the reading-link POST only.
 *
 * @param int $sid Subscriber post ID.
 */
function ideatoapps_reader_set_cookie( int $sid ): void {
	$value   = ideatoapps_reader_cookie_value( $sid );
	$expires = (int) explode( '.', $value )[1];
	do_action( 'ideatoapps_reader_cookie_set', $sid, $value );
	if ( ! headers_sent() ) {
		setcookie( IDEATOAPPS_READER_COOKIE, $value, ideatoapps_reader_cookie_options( $expires ) );
	}
	$_COOKIE[ IDEATOAPPS_READER_COOKIE ] = $value; // the page answered by this same request already counts the reader.
}
