<?php
require_once __DIR__ . '/ReaderTestCase.php';

/**
 * The reader cookie `ita_reader`: "sid.expires.mac", HMAC-SHA256 over a reader-only prefix, the id and the expiry, keyed with
 * wp_salt( 'auth' ). Every check also needs the subscriber to exist and still be confirmed. It is set only by the POST that confirms
 * a sign-up and by the POST on a reading-link page, never by a GET.
 */
final class ReaderCookieTest extends ReaderTestCase {
	public function test_a_fresh_cookie_names_its_confirmed_subscriber_and_lasts_180_days(): void {
		$sid = $this->subscriber( 'confirmed' );
		$now = 1_800_000_000;
		$v   = ideatoapps_reader_cookie_value( $sid, $now );
		$this->assertMatchesRegularExpression( '/^' . $sid . '\.' . ( $now + 180 * DAY_IN_SECONDS ) . '\.[a-f0-9]{64}$/', $v );
		$this->assertSame( hash_hmac( 'sha256', 'ideatoapps-reader|' . $sid . '|' . ( $now + 180 * DAY_IN_SECONDS ), wp_salt( 'auth' ) ), explode( '.', $v )[2] );
		$this->assertSame( $sid, ideatoapps_reader_cookie_subscriber( $v, $now ) );
		$this->assertSame( $sid, ideatoapps_reader_cookie_subscriber( $v, $now + 179 * DAY_IN_SECONDS ) );
		$this->assertSame( 0, ideatoapps_reader_cookie_subscriber( $v, $now + 180 * DAY_IN_SECONDS + 1 ), 'expired' );
	}

	public function test_tampered_swapped_or_malformed_cookies_are_rejected(): void {
		$sid   = $this->subscriber( 'confirmed' );
		$other = $this->subscriber( 'confirmed', 'other@example.com' );
		$v     = ideatoapps_reader_cookie_value( $sid );
		list( , $exp, $mac ) = explode( '.', $v );
		$bad   = array(
			'flipped mac'      => $sid . '.' . $exp . '.' . ( '0' === $mac[0] ? '1' : '0' ) . substr( $mac, 1 ),
			'other subscriber' => $other . '.' . $exp . '.' . $mac,
			'longer expiry'    => $sid . '.' . ( (int) $exp + 1 ) . '.' . $mac,
			'upper-case mac'   => $sid . '.' . $exp . '.' . strtoupper( $mac ),
			'extra part'       => $v . '.1',
			'trailing newline' => $v . "\n",
			'empty'            => '',
			'garbage'          => 'not-a-cookie',
		);
		foreach ( $bad as $why => $value ) {
			$this->assertSame( 0, ideatoapps_reader_cookie_subscriber( $value ), $why );
		}
		$this->assertSame( 0, ideatoapps_reader_cookie_subscriber( array( $v ) ), 'array' );
		$this->assertSame( 0, ideatoapps_reader_cookie_subscriber( null ), 'missing' );
	}

	public function test_a_mac_made_with_another_prefix_or_key_is_rejected(): void {
		$sid = $this->subscriber( 'confirmed' );
		$exp = time() + DAY_IN_SECONDS;
		foreach ( array(
			'newsletter prefix' => hash_hmac( 'sha256', 'ideatoapps-newsletter|' . $sid . '|' . $exp, wp_salt( 'auth' ) ),
			'no prefix'         => hash_hmac( 'sha256', $sid . '|' . $exp, wp_salt( 'auth' ) ),
			'other salt'        => hash_hmac( 'sha256', 'ideatoapps-reader|' . $sid . '|' . $exp, wp_salt( 'nonce' ) ),
		) as $why => $mac ) {
			$this->assertSame( 0, ideatoapps_reader_cookie_subscriber( "{$sid}.{$exp}.{$mac}" ), $why );
		}
		$good = hash_hmac( 'sha256', 'ideatoapps-reader|' . $sid . '|' . $exp, wp_salt( 'auth' ) );
		$this->assertSame( $sid, ideatoapps_reader_cookie_subscriber( "{$sid}.{$exp}.{$good}" ), 'control: the right prefix and key pass' );
	}

	public function test_an_expiry_further_ahead_than_180_days_is_rejected_even_when_signed(): void {
		$sid = $this->subscriber( 'confirmed' );
		$exp = time() + 400 * DAY_IN_SECONDS;
		$this->assertSame( 0, ideatoapps_reader_cookie_subscriber( $sid . '.' . $exp . '.' . ideatoapps_reader_mac( $sid, $exp ) ) );
	}

	public function test_only_a_confirmed_subscriber_that_still_exists_counts(): void {
		foreach ( array( 'pending', 'unsubscribed', 'bogus' ) as $i => $status ) {
			$sid = $this->subscriber( $status, "s{$i}@example.com" );
			$this->assertSame( 0, ideatoapps_reader_cookie_subscriber( ideatoapps_reader_cookie_value( $sid ) ), $status );
		}
		$sid = $this->subscriber( 'confirmed' );
		$v   = ideatoapps_reader_cookie_value( $sid );
		update_post_meta( $sid, 'status', 'unsubscribed' );
		$this->assertSame( 0, ideatoapps_reader_cookie_subscriber( $v ), 'unsubscribed after the cookie was set' );
		update_post_meta( $sid, 'status', 'confirmed' );
		ideatoapps_newsletter_privacy_erase( 'reader@example.com' );
		$this->assertSame( 0, ideatoapps_reader_cookie_subscriber( $v ), 'erased' );
		$post = (int) wp_insert_post( array( 'post_title' => 'Not a subscriber', 'post_status' => 'publish' ) );
		update_post_meta( $post, 'status', 'confirmed' );
		$this->assertSame( 0, ideatoapps_reader_cookie_subscriber( ideatoapps_reader_cookie_value( $post ) ), 'a post of another type' );
	}

	public function test_the_cookie_is_http_only_same_site_lax_site_wide_and_secure_on_https(): void {
		$opt = ideatoapps_reader_cookie_options( 1234 );
		$this->assertSame( array( 'expires' => 1234, 'path' => '/', 'domain' => '', 'secure' => false, 'httponly' => true, 'samesite' => 'Lax' ), $opt );
		$_SERVER['HTTPS'] = 'on';
		$this->assertTrue( ideatoapps_reader_cookie_options( 1 )['secure'] );
		unset( $_SERVER['HTTPS'] );
		$this->assertSame( 'ita_reader', IDEATOAPPS_READER_COOKIE );
	}

	public function test_the_confirming_post_sets_the_cookie_and_no_get_or_other_post_does(): void {
		$sid = $this->subscriber( 'pending' );
		parse_str( (string) wp_parse_url( ideatoapps_newsletter_url( $sid, 'confirm' ), PHP_URL_QUERY ), $confirm );
		parse_str( (string) wp_parse_url( ideatoapps_newsletter_url( $sid, 'unsubscribe' ), PHP_URL_QUERY ), $unsub );
		ideatoapps_newsletter_page_response( 'GET', $confirm, array( 'ita_do' => 'confirm' ) );
		ideatoapps_newsletter_page_response( 'HEAD', $confirm, array( 'ita_do' => 'confirm' ) );
		ideatoapps_newsletter_page_response( 'POST', array( 't' => 'bad' ) + $confirm, array( 'ita_do' => 'confirm' ) );
		ideatoapps_newsletter_page_response( 'POST', $confirm, array( 'ita_do' => 'nope' ) );
		$this->assertSame( array(), $this->cookies, 'GET, HEAD, a bad token and a wrong button set nothing' );
		$this->assertSame( 'pending', ideatoapps_subscriber_status( $sid ) );

		$res = ideatoapps_newsletter_page_response( 'POST', $confirm, array( 'ita_do' => 'confirm' ) );
		$this->assertSame( 'confirmed', $res['view'] );
		$this->assertCount( 1, $this->cookies );
		$this->assertSame( $sid, $this->cookies[0][0] );
		$this->assertSame( $sid, ideatoapps_reader_cookie_subscriber( $this->cookies[0][1] ) );

		$this->cookies = array();
		ideatoapps_newsletter_page_response( 'GET', $confirm, array() );
		ideatoapps_newsletter_page_response( 'GET', $unsub, array() );
		ideatoapps_newsletter_page_response( 'POST', $unsub, array( 'ita_do' => 'unsubscribe' ) );
		$this->assertSame( array(), $this->cookies, 'a confirmed GET and the unsubscribe POST set nothing' );
	}

	public function test_the_current_subscriber_comes_from_the_request_cookie(): void {
		$sid = $this->subscriber( 'confirmed' );
		$this->assertSame( 0, ideatoapps_reader_current_subscriber() );
		$this->with_cookie( $sid );
		$this->assertSame( $sid, ideatoapps_reader_current_subscriber() );
		$_COOKIE['ita_reader'] = wp_slash( 'x"y' );
		$this->assertSame( 0, ideatoapps_reader_current_subscriber() );
	}
}
