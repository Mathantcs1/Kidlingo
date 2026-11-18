<?php
/**
 * "Already subscribed? Email me a reading link" (new device, cleared cookies).
 *
 * The request (POST /?ita_reader=request, field email) is rate limited and answers the same page, status and words whether the
 * address is a confirmed subscriber, pending, unsubscribed or unknown; only a confirmed subscriber is mailed, after the response
 * (shutdown hook, like the newsletter confirmation), at most once per 10 minutes. The mail holds a signed link
 * (/?ita_reader=read&sid=ID&t=ISSUED.MAC): HMAC-SHA256 over "ideatoapps-reader-link|id|read|issued" with wp_salt( 'auth' ), valid
 * for one day. The link's page (reader-link-page.php) shows a button on GET; its POST sets the reader cookie and marks the link used
 * (`read_link_used_at` = its issue time), so each link works once.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

const IDEATOAPPS_READER_LINK_TTL        = DAY_IN_SECONDS;
const IDEATOAPPS_READER_LINK_DAILY_CAP  = 3;  // per subscriber per UTC day.
const IDEATOAPPS_READER_LINK_HOURLY_CAP = 60; // site-wide per UTC hour.

/**
 * Keyed hash of a reading link.
 *
 * @param int    $sid    Subscriber post ID.
 * @param string $issued Issue time.
 */
function ideatoapps_reader_link_mac( int $sid, string $issued ): string {
	return hash_hmac( 'sha256', 'ideatoapps-reader-link|' . $sid . '|read|' . $issued, wp_salt( 'auth' ) );
}

/**
 * A reading-link token "issued.mac".
 *
 * @param int      $sid Subscriber post ID.
 * @param int|null $now Issue time (tests).
 */
function ideatoapps_reader_link_token( int $sid, ?int $now = null ): string {
	$issued = (string) ( null === $now ? time() : $now );
	return $issued . '.' . ideatoapps_reader_link_mac( $sid, $issued );
}

/**
 * Check a token: ok, expired or invalid.
 *
 * @param int      $sid   Subscriber post ID.
 * @param mixed    $token Submitted token.
 * @param int|null $now   Current time (tests).
 */
function ideatoapps_reader_link_check( int $sid, $token, ?int $now = null ): string {
	if ( ! is_string( $token ) || 1 !== preg_match( '/^(\d{1,12})\.([a-f0-9]{64})\z/', $token, $m ) ) {
		return 'invalid';
	}
	if ( ! hash_equals( ideatoapps_reader_link_mac( $sid, $m[1] ), $m[2] ) ) {
		return 'invalid';
	}
	$now = null === $now ? time() : $now;
	if ( (int) $m[1] > $now + 300 ) {
		return 'invalid';
	}
	return $now - (int) $m[1] > IDEATOAPPS_READER_LINK_TTL ? 'expired' : 'ok';
}

/**
 * The reading-link URL, optionally leading back to a post.
 *
 * @param int $sid  Subscriber post ID.
 * @param int $back Post to return to (0 for none).
 */
function ideatoapps_reader_link_url( int $sid, int $back = 0 ): string {
	$args = array( 'ita_reader' => 'read', 'sid' => $sid, 't' => ideatoapps_reader_link_token( $sid ) );
	if ( $back > 0 ) {
		$args['back'] = $back;
	}
	return add_query_arg( $args, home_url( '/' ) );
}

/**
 * A published post to link back to, or 0.
 *
 * @param mixed $raw Submitted value.
 */
function ideatoapps_reader_back( $raw ): int {
	$id = is_scalar( $raw ) ? absint( $raw ) : 0;
	return $id > 0 && 'post' === get_post_type( $id ) && 'publish' === get_post_status( $id ) ? $id : 0;
}

/**
 * Plain-text body of the reading-link email.
 *
 * @param int $sid  Subscriber post ID.
 * @param int $back Post to return to.
 */
function ideatoapps_reader_link_body( int $sid, int $back ): string {
	$lines = array(
		__( 'Someone (hopefully you) asked for a reading link for the IdeaToApps subscriber-only articles.', 'ideatoapps-core' ),
		'',
		__( 'Open this link and press the button: it unlocks subscriber-only articles in that browser. The link works for one day, once:', 'ideatoapps-core' ),
		ideatoapps_reader_link_url( $sid, $back ),
		'',
		__( 'If you did not ask for this, ignore this email: nothing happens unless you press the button.', 'ideatoapps-core' ),
		'',
		__( 'To unsubscribe, or to have your address deleted, open this link:', 'ideatoapps-core' ),
		ideatoapps_newsletter_url( $sid, 'unsubscribe' ),
	);
	return implode( "\n", $lines ) . "\n";
}

/**
 * Queue a reading link for the shutdown hook.
 *
 * @param int $sid  Subscriber post ID.
 * @param int $back Post to return to.
 */
function ideatoapps_reader_link_queue( int $sid, int $back ): void {
	$GLOBALS['ideatoapps_reader_link_queue'][ $sid ] = $back;
	if ( false === has_action( 'shutdown', 'ideatoapps_reader_link_flush_queue' ) ) {
		add_action( 'shutdown', 'ideatoapps_reader_link_flush_queue' );
	}
}

/**
 * Shutdown hook: finish the response when the server allows it, then send the queued links. A failure is counted (never with
 * the address) by the newsletter's mail failure counter and starts no throttle.
 */
function ideatoapps_reader_link_flush_queue(): void {
	$queue = (array) ( $GLOBALS['ideatoapps_reader_link_queue'] ?? array() );
	$GLOBALS['ideatoapps_reader_link_queue'] = array();
	if ( ! $queue ) {
		return;
	}
	if ( function_exists( 'fastcgi_finish_request' ) ) {
		fastcgi_finish_request();
	} elseif ( function_exists( 'litespeed_finish_request' ) ) {
		litespeed_finish_request();
	}
	ignore_user_abort( true );
	foreach ( $queue as $sid => $back ) {
		try {
			$email = (string) get_post_meta( (int) $sid, 'email', true );
			$sent  = is_email( $email ) && ideatoapps_with_sender( static fn() => wp_mail( $email, __( 'Your IdeaToApps reading link', 'ideatoapps-core' ), ideatoapps_reader_link_body( (int) $sid, (int) $back ), array( 'Content-Type: text/plain; charset=UTF-8' ) ) );
		} catch ( \Throwable $e ) {
			$sent = false;
		}
		if ( $sent ) {
			update_post_meta( (int) $sid, 'read_link_sent_at', time() );
		} else {
			ideatoapps_newsletter_record_failure();
		}
	}
}

/**
 * Handle a reading-link request. Same answer for every address that is valid; only a confirmed subscriber not mailed in the last
 * 10 minutes is queued.
 *
 * @param array $post Unslashed form fields (email, back).
 * @return array{status:int, view:string, back:int}
 */
function ideatoapps_reader_link_request( array $post ): array {
	$back = ideatoapps_reader_back( $post['back'] ?? 0 );
	$out  = static fn( int $status, string $view ) => array( 'status' => $status, 'view' => $view, 'back' => $back );
	if ( ! ideatoapps_newsletter_enabled() ) {
		return $out( 503, 'unavailable' );
	}
	if ( ideatoapps_rate_limit_exceeded( 'reader_link' ) ) {
		return $out( 429, 'rate_limited' );
	}
	$email = isset( $post['email'] ) && is_string( $post['email'] ) ? strtolower( trim( $post['email'] ) ) : '';
	if ( '' === $email || ! is_email( $email ) || sanitize_email( $email ) !== $email ) {
		return $out( 400, 'bad_email' );
	}
	$sid = ideatoapps_find_subscriber( $email );
	if ( $sid && 'confirmed' === ideatoapps_subscriber_status( $sid ) && time() - (int) get_post_meta( $sid, 'read_link_sent_at', true ) >= 10 * MINUTE_IN_SECONDS && ideatoapps_reader_link_claim_caps( $sid ) ) {
		ideatoapps_reader_link_queue( $sid, $back );
	}
	return $out( 200, 'link_sent' );
}

/**
 * Count one reading link against the caps (3 per subscriber per UTC day, 60 site-wide per UTC hour); false when either is used up.
 * The form has no nonce and other sites can make their visitors post it, so these caps (not the per-IP limit) bound the mail volume.
 *
 * @param int $sid Subscriber post ID.
 */
function ideatoapps_reader_link_claim_caps( int $sid ): bool {
	$count = static function ( string $raw, string $key ): int {
		$parts = explode( ':', $raw );
		return 2 === count( $parts ) && $parts[0] === $key ? (int) $parts[1] : 0;
	};
	$day  = gmdate( 'Ymd' );
	$hour = gmdate( 'YmdH' );
	$mine = $count( (string) get_post_meta( $sid, 'read_link_day', true ), $day );
	$all  = $count( (string) get_option( 'ideatoapps_reader_link_hour', '' ), $hour );
	if ( $mine >= IDEATOAPPS_READER_LINK_DAILY_CAP || $all >= IDEATOAPPS_READER_LINK_HOURLY_CAP ) {
		return false;
	}
	update_post_meta( $sid, 'read_link_day', $day . ':' . ( $mine + 1 ) );
	update_option( 'ideatoapps_reader_link_hour', $hour . ':' . ( $all + 1 ), false );
	return true;
}
