<?php
require_once __DIR__ . '/ReaderTestCase.php';

/**
 * "Already subscribed? Email me a reading link": a neutral, rate-limited POST that mails a confirmed subscriber a signed, one-day,
 * one-time link (after the response), and the link's page, where GET shows a button and only the POST sets the reader cookie.
 */
final class ReaderLinkTest extends ReaderTestCase {
	private function ask( string $email, array $extra = array() ): array {
		return ideatoapps_reader_page_response( 'POST', array( 'ita_reader' => 'request' ), array( 'email' => $email ) + $extra );
	}

	private function link_query( int $sid, ?int $now = null ): array {
		return array( 'ita_reader' => 'read', 'sid' => (string) $sid, 't' => ideatoapps_reader_link_token( $sid, $now ) );
	}

	public function test_known_unknown_pending_and_unsubscribed_addresses_get_the_identical_answer(): void {
		$this->subscriber( 'confirmed', 'yes@example.com' );
		$this->subscriber( 'pending', 'pend@example.com' );
		$this->subscriber( 'unsubscribed', 'gone@example.com' );
		$answers = array();
		foreach ( array( 'yes@example.com', 'YES@example.com ', 'nobody@example.com', 'pend@example.com', 'gone@example.com' ) as $email ) {
			$res       = $this->ask( $email, array( 'back' => '0' ) );
			$answers[] = array( $res, ideatoapps_reader_page_html( $res ) );
		}
		$this->assertSame( 200, $answers[0][0]['status'] );
		$this->assertSame( 'link_sent', $answers[0][0]['view'] );
		foreach ( $answers as $i => $a ) {
			$this->assertSame( $answers[0], $a, "answer {$i} differs" );
		}
		$this->assertStringNotContainsString( 'yes@example.com', $answers[0][1], 'the address is never echoed' );
		$this->assertSame( array(), $this->mails, 'nothing is mailed while the request is answered' );
		$this->assertNotFalse( has_action( 'shutdown', 'ideatoapps_reader_link_flush_queue' ) );
		ideatoapps_reader_link_flush_queue();
		$this->assertCount( 1, $this->mails, 'only the confirmed subscriber gets a mail, once' );
		$this->assertSame( 'yes@example.com', $this->mails[0]['to'] );
	}

	public function test_the_mail_is_plain_text_and_says_what_the_link_does_and_that_it_expires_in_a_day(): void {
		$sid = $this->subscriber( 'confirmed', 'yes@example.com' );
		$post = (int) wp_insert_post( array( 'post_title' => 'Back here', 'post_status' => 'publish' ) );
		$this->ask( 'yes@example.com', array( 'back' => (string) $post ) );
		ideatoapps_reader_link_flush_queue();
		$m = $this->mails[0];
		$this->assertSame( 'Your IdeaToApps reading link', $m['subject'] );
		$this->assertContains( 'Content-Type: text/plain; charset=UTF-8', (array) $m['headers'] );
		$this->assertStringContainsString( 'unlocks subscriber-only articles', $m['message'] );
		$this->assertStringContainsString( 'works for one day', $m['message'] );
		$this->assertMatchesRegularExpression( '/ignore this email: nothing happens/i', $m['message'] );
		$this->assertMatchesRegularExpression( '#ita_reader=read&sid=' . $sid . '&t=\d+\.[a-f0-9]{64}&back=' . $post . '#', $m['message'] );
		$this->assertStringContainsString( 'ita_newsletter=unsubscribe', $m['message'] );
		$this->assertStringNotContainsString( '<a ', $m['message'] );
	}

	public function test_at_most_one_reading_link_per_ten_minutes_and_a_failure_is_counted_without_the_address(): void {
		$sid           = $this->subscriber( 'confirmed', 'yes@example.com' );
		$this->mail_ok = false;
		$this->ask( 'yes@example.com' );
		ideatoapps_reader_link_flush_queue();
		$this->assertSame( 1, (int) get_option( 'ideatoapps_newsletter_mail_failures' ) );
		$this->assertSame( '', (string) get_post_meta( $sid, 'read_link_sent_at', true ), 'a failure starts no throttle' );
		$this->mail_ok = true;
		$this->ask( 'yes@example.com' );
		ideatoapps_reader_link_flush_queue();
		$this->ask( 'yes@example.com' );
		ideatoapps_reader_link_flush_queue();
		$this->assertCount( 2, $this->mails, 'one failed, one sent, the third throttled' );
	}

	public function test_bad_input_rate_limit_and_switch_off(): void {
		$this->assertSame( array( 400, 'bad_email' ), array_values( array_slice( $this->ask( '<b>@x.com' ), 0, 2 ) ) );
		$this->assertSame( 400, ideatoapps_reader_page_response( 'POST', array( 'ita_reader' => 'request' ), array( 'email' => array( 'a' ) ) )['status'] );
		$form = ideatoapps_reader_page_response( 'GET', array( 'ita_reader' => 'request' ), array( 'email' => 'yes@example.com' ) );
		$this->assertSame( array( 200, 'request_form' ), array( $form['status'], $form['view'] ) );
		$this->assertStringContainsString( 'data-testid="gate-link-form"', ideatoapps_reader_page_html( $form ) );
		$codes = array();
		for ( $i = 0; $i < 7; $i++ ) {
			$codes[] = $this->ask( "n{$i}@example.com" )['status'];
		}
		$this->assertContains( 429, $codes );
		update_option( 'ideatoapps_newsletter_enabled', false );
		$_SERVER['REMOTE_ADDR'] = '198.51.100.251';
		$this->subscriber( 'confirmed', 'yes@example.com' );
		$this->assertSame( 'unavailable', $this->ask( 'yes@example.com' )['view'] );
		ideatoapps_reader_link_flush_queue();
		$this->assertSame( array(), $this->mails );
	}

	public function test_tokens_are_bound_to_the_subscriber_and_expire_after_a_day(): void {
		$sid = $this->subscriber( 'confirmed' );
		$now = 1_800_000_000;
		$t   = ideatoapps_reader_link_token( $sid, $now );
		$this->assertSame( 'ok', ideatoapps_reader_link_check( $sid, $t, $now + DAY_IN_SECONDS ) );
		$this->assertSame( 'expired', ideatoapps_reader_link_check( $sid, $t, $now + DAY_IN_SECONDS + 1 ) );
		$this->assertSame( 'invalid', ideatoapps_reader_link_check( $sid + 1, $t, $now ) );
		$this->assertSame( 'invalid', ideatoapps_reader_link_check( $sid, ideatoapps_newsletter_token( $sid, 'confirm', $now ), $now ), 'a newsletter confirm token is not a reading link' );
		$this->assertSame( 'invalid', ideatoapps_reader_link_check( $sid, ( $now + 1 ) . substr( $t, strpos( $t, '.' ) ), $now ), 'issue time is signed' );
		$this->assertSame( 'invalid', ideatoapps_reader_link_check( $sid, ideatoapps_reader_link_token( $sid, $now + 3600 ), $now ), 'issued in the future' );
		$this->assertSame( 'invalid', ideatoapps_reader_link_check( $sid, array( $t ), $now ) );
	}

	public function test_get_shows_a_button_and_only_the_post_sets_the_cookie_once(): void {
		$sid = $this->subscriber( 'confirmed' );
		$q   = $this->link_query( $sid );
		for ( $i = 0; $i < 2; $i++ ) {
			$res = ideatoapps_reader_page_response( 'GET', $q, array( 'ita_do' => 'read' ) );
			$this->assertSame( array( 200, 'read_form' ), array( $res['status'], $res['view'] ) );
		}
		$this->assertStringContainsString( 'data-testid="reader-read-button"', ideatoapps_reader_page_html( $res ) );
		$this->assertSame( array(), $this->cookies, 'a link scanner GET sets nothing' );
		$this->assertSame( 'invalid', ideatoapps_reader_page_response( 'POST', $q, array( 'ita_do' => 'other' ) )['view'] );
		$this->assertSame( array(), $this->cookies );

		$res = ideatoapps_reader_page_response( 'POST', $q, array( 'ita_do' => 'read' ) );
		$this->assertSame( array( 200, 'unlocked' ), array( $res['status'], $res['view'] ) );
		$this->assertSame( array( $sid ), array_column( $this->cookies, 0 ) );
		$again = ideatoapps_reader_page_response( 'POST', $q, array( 'ita_do' => 'read' ) );
		$this->assertSame( array( 400, 'used' ), array( $again['status'], $again['view'] ), 'one-time: a second POST with the same link sets nothing' );
		$this->assertCount( 1, $this->cookies );
		$this->assertSame( 'used', ideatoapps_reader_page_response( 'GET', $q, array() )['view'] );
	}

	public function test_bad_expired_or_unconfirmed_links_set_no_cookie(): void {
		$sid  = $this->subscriber( 'confirmed' );
		$pend = $this->subscriber( 'pending', 'p@example.com' );
		$cases = array(
			'tampered'   => array( 't' => 'x' ) + $this->link_query( $sid ),
			'expired'    => $this->link_query( $sid, time() - DAY_IN_SECONDS - 10 ),
			'pending'    => $this->link_query( $pend ),
		);
		foreach ( $cases as $why => $q ) {
			$res = ideatoapps_reader_page_response( 'POST', $q, array( 'ita_do' => 'read' ) );
			$this->assertNotSame( 'unlocked', $res['view'], $why );
		}
		$q = $this->link_query( $sid );
		update_post_meta( $sid, 'status', 'unsubscribed' );
		$this->assertSame( 'not_subscribed', ideatoapps_reader_page_response( 'POST', $q, array( 'ita_do' => 'read' ) )['view'] );
		$this->assertSame( array(), $this->cookies );
	}

	public function test_reading_posts_are_rate_limited_and_the_page_is_private(): void {
		$sid   = $this->subscriber( 'confirmed' );
		$codes = array();
		for ( $i = 0; $i < 7; $i++ ) {
			$codes[] = ideatoapps_reader_page_response( 'POST', array( 't' => 'x' ) + $this->link_query( $sid ), array( 'ita_do' => 'read' ) )['status'];
		}
		$this->assertContains( 429, $codes );
		$h = ideatoapps_newsletter_page_headers();
		$this->assertStringContainsString( 'no-store', $h['Cache-Control'] );
		$this->assertStringContainsString( 'noindex', $h['X-Robots-Tag'] );
		$this->assertSame( 'no-referrer', $h['Referrer-Policy'] );
	}
}
