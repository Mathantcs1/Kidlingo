<?php
/**
 * Newsletter double opt-in: the switch, the sign-up states, signed tokens, the confirm / unsubscribe page and the
 * confirmation email. Mail is captured with pre_wp_mail; nothing is ever sent.
 */
final class NewsletterOptInTest extends WPTestCase {
	/** @var array<int, array<string, mixed>> */
	private array $mails = array();
	private bool $mail_ok = true;
	/** @var callable */
	private $capture;

	protected function setUp(): void {
		parent::setUp();
		$_SERVER['REMOTE_ADDR'] = '203.0.113.' . wp_rand( 1, 250 );
		$this->mails            = array();
		$this->mail_ok          = true;
		update_option( 'ideatoapps_newsletter_enabled', true );
		$this->capture = function ( $short, $atts ) {
			$this->mails[] = $atts;
			return $this->mail_ok;
		};
		add_filter( 'pre_wp_mail', $this->capture, 10, 2 );
		$GLOBALS['ideatoapps_newsletter_queue'] = array();
		remove_action( 'shutdown', 'ideatoapps_newsletter_flush_queue' ); // so a registration seen below was made by the code under test.
	}

	protected function tearDown(): void {
		remove_filter( 'pre_wp_mail', $this->capture, 10 );
		delete_option( 'ideatoapps_newsletter_enabled' );
		delete_option( 'ideatoapps_newsletter_mail_failures' );
		unset( $_SERVER['REMOTE_ADDR'], $GLOBALS['ideatoapps_newsletter_queue'] );
		$_POST = array();
		parent::tearDown();
	}

	private function signup( string $email = 'ann@example.com', bool $nonce = true, bool $flush = true ): WP_REST_Response {
		$req = new WP_REST_Request( 'POST', '/ideatoapps/v1/newsletter' );
		$req->set_header( 'Content-Type', 'application/json' );
		if ( $nonce ) {
			$req->set_header( 'X-WP-Nonce', wp_create_nonce( 'wp_rest' ) );
		}
		$req->set_body( wp_json_encode( array( 'email' => $email, 'consent' => true ) ) );
		$res = rest_do_request( $req );
		if ( $flush ) {
			ideatoapps_newsletter_flush_queue(); // what the shutdown hook does after the response has been sent.
		}
		return $res;
	}

	private function id_of( string $email ): int {
		return ideatoapps_find_subscriber( $email );
	}

	private function make( string $status, string $email = 'ann@example.com' ): int {
		$id = wp_insert_post( array( 'post_type' => 'ita_subscriber', 'post_status' => 'private', 'post_title' => $email, 'meta_input' => array( 'email' => $email, 'consent_at' => gmdate( 'c' ), 'status' => $status ) ) );
		return (int) $id;
	}

	/** Query array of the link in a page URL. */
	private function query( int $id, string $action ): array {
		parse_str( (string) wp_parse_url( ideatoapps_newsletter_url( $id, $action ), PHP_URL_QUERY ), $q );
		return $q;
	}

	private function page( string $method, array $query, array $post = array() ): array {
		return ideatoapps_newsletter_page_response( $method, $query, $post );
	}

	// ---- the switch ----------------------------------------------------------------------------------------------

	public function test_off_by_default_and_registered_as_a_setting(): void {
		delete_option( 'ideatoapps_newsletter_enabled' );
		$this->assertFalse( ideatoapps_newsletter_enabled() );
		$this->assertArrayHasKey( 'ideatoapps_newsletter_enabled', get_registered_settings() );
		$this->assertFalse( get_registered_settings()['ideatoapps_newsletter_enabled']['default'] );
	}

	public function test_signup_is_503_while_off_even_with_a_good_nonce_and_stores_and_sends_nothing(): void {
		delete_option( 'ideatoapps_newsletter_enabled' );
		$res = $this->signup();
		$this->assertSame( 503, $res->get_status() );
		$this->assertStringContainsString( 'not yet available', (string) $res->get_data()['message'] );
		$this->assertSame( 503, $this->signup( 'a@example.com', false )->get_status(), 'the switch is checked before the nonce' );
		$this->assertSame( 0, $this->id_of( 'ann@example.com' ) );
		$this->assertSame( array(), $this->mails );
	}

	public function test_admins_turn_it_on_from_the_settings_form_and_an_unchecked_box_turns_it_off(): void {
		delete_option( 'ideatoapps_newsletter_enabled' );
		wp_set_current_user( self::make_user( 'administrator' ) );
		$post = array( '_wpnonce' => wp_create_nonce( 'ideatoapps_save_settings' ), 'newsletter_enabled' => '1' );
		ideatoapps_process_settings( $post );
		$this->assertTrue( ideatoapps_newsletter_enabled() );
		unset( $post['newsletter_enabled'] );
		ideatoapps_process_settings( $post );
		$this->assertFalse( ideatoapps_newsletter_enabled() );
		wp_set_current_user( self::make_user( 'editor' ) );
		ideatoapps_process_settings( $post + array( 'newsletter_enabled' => '1' ) );
		$this->assertFalse( ideatoapps_newsletter_enabled(), 'an editor cannot turn it on' );
	}

	// ---- sign-up -------------------------------------------------------------------------------------------------

	public function test_new_signup_is_pending_not_confirmed_and_sends_one_plain_text_confirmation(): void {
		$res = $this->signup( 'Ann@Example.com' );
		$this->assertSame( 200, $res->get_status() );
		$id = $this->id_of( 'ann@example.com' );
		$this->assertGreaterThan( 0, $id );
		$this->assertSame( 'pending', get_post_meta( $id, 'status', true ) );
		$this->assertSame( '', (string) get_post_meta( $id, 'confirmed_at', true ) );
		$this->assertCount( 1, $this->mails );
		$mail = $this->mails[0];
		$this->assertSame( array( 'ann@example.com' ), (array) $mail['to'] );
		$this->assertSame( 'Confirm your IdeaToApps newsletter sign-up', $mail['subject'] );
		$headers = implode( "\n", (array) $mail['headers'] );
		$this->assertStringContainsString( 'text/plain', $headers );
		$this->assertStringNotContainsString( 'From:', $headers, 'the sender is the WordPress default unless the owner sets one' );
		$this->assertStringNotContainsString( 'List-Unsubscribe', $headers, 'no bulk mail is sent' );
	}

	public function test_confirmation_email_has_both_links_the_ignore_line_and_no_tracking_or_html(): void {
		$this->signup();
		$id   = $this->id_of( 'ann@example.com' );
		$body = (string) $this->mails[0]['message'];
		$this->assertStringContainsString( ideatoapps_newsletter_url( $id, 'unsubscribe' ), $body );
		preg_match( '#https?://\S+ita_newsletter=confirm\S*#', $body, $m );
		$this->assertNotEmpty( $m, 'confirm link' );
		parse_str( (string) wp_parse_url( html_entity_decode( $m[0] ), PHP_URL_QUERY ), $q );
		$this->assertSame( 'ok', ideatoapps_newsletter_token_check( $id, 'confirm', (string) $q['t'] ) );
		$this->assertStringContainsStringIgnoringCase( 'newsletter', $body );
		$this->assertMatchesRegularExpression( '/ignore this (email|message)/i', $body );
		$this->assertMatchesRegularExpression( '/nothing (happens|is sent|will be sent)/i', $body );
		$this->assertDoesNotMatchRegularExpression( '/<[a-z!][^>]*>/i', $body, 'plain text, no markup or images' );
		$this->assertDoesNotMatchRegularExpression( '/\b(weekly|daily|monthly|tips)\b/i', $body, 'no claims about frequency or content' );
	}

	public function test_signup_answers_are_identical_for_new_pending_and_confirmed_addresses_and_unknown_state_is_never_revealed(): void {
		$new = $this->signup( 'new@example.com' );
		$this->make( 'confirmed', 'conf@example.com' );
		$conf = $this->signup( 'conf@example.com' );
		$pend = $this->signup( 'new@example.com' );
		$this->assertSame( 200, $conf->get_status() );
		$this->assertSame( $new->get_data(), $conf->get_data() );
		$this->assertSame( $new->get_data(), $pend->get_data() );
		$this->assertStringNotContainsStringIgnoringCase( 'already', wp_json_encode( $new->get_data() ) );
		$this->assertStringNotContainsString( '@', wp_json_encode( $new->get_data() ) );
	}

	public function test_confirmed_address_gets_no_email_and_stays_confirmed(): void {
		$id = $this->make( 'confirmed', 'conf@example.com' );
		$this->signup( 'conf@example.com' );
		$this->assertSame( array(), $this->mails );
		$this->assertSame( 'confirmed', get_post_meta( $id, 'status', true ) );
	}

	public function test_pending_address_gets_at_most_one_confirmation_per_ten_minutes(): void {
		$this->signup( 'p@example.com' );
		$this->signup( 'p@example.com' );
		$this->signup( 'P@example.com' );
		$this->assertCount( 1, $this->mails, 'throttled' );
		$id = $this->id_of( 'p@example.com' );
		update_post_meta( $id, 'confirmation_sent_at', time() - 9 * MINUTE_IN_SECONDS );
		$this->signup( 'p@example.com' );
		$this->assertCount( 1, $this->mails, 'still inside the window' );
		update_post_meta( $id, 'confirmation_sent_at', time() - 10 * MINUTE_IN_SECONDS - 1 );
		$this->signup( 'p@example.com' );
		$this->assertCount( 2, $this->mails, 'one more after ten minutes' );
		$this->assertCount( 1, get_posts( array( 'post_type' => 'ita_subscriber', 'post_status' => 'any', 'numberposts' => -1 ) ) );
	}

	public function test_a_stranger_signing_up_an_unsubscribed_address_does_not_make_it_mailable(): void {
		$id = $this->make( 'unsubscribed', 'gone@example.com' );
		update_post_meta( $id, 'unsubscribed_at', '2026-01-01T00:00:00+00:00' );
		$this->signup( 'gone@example.com' );
		$this->assertSame( 'unsubscribed', get_post_meta( $id, 'status', true ), 'only a confirm POST changes the status' );
		$this->assertSame( '2026-01-01T00:00:00+00:00', get_post_meta( $id, 'unsubscribed_at', true ), 'the opt-out time is kept' );
		$this->assertNotSame( '', (string) get_post_meta( $id, 'resubscribe_requested_at', true ) );
		$this->assertCount( 1, $this->mails, 'a confirmation is mailed' );
		$this->assertSame( array(), ita_subscribers() );
		$this->assertStringNotContainsString( 'gone@example.com', ita_subscribers_csv() );
	}

	public function test_the_owner_can_re_subscribe_by_confirming_after_such_a_request_and_only_then(): void {
		$id = $this->make( 'unsubscribed', 'gone@example.com' );
		update_post_meta( $id, 'unsubscribed_at', '2026-01-01T00:00:00+00:00' );
		$q = $this->query( $id, 'confirm' );
		$this->assertSame( 400, $this->page( 'POST', $q, array( 'ita_do' => 'confirm' ) )['status'], 'no request, no re-confirmation with an old link' );
		$this->signup( 'gone@example.com' );
		$this->assertSame( 'confirm_form', $this->page( 'GET', $q )['view'] );
		$this->assertSame( 'unsubscribed', get_post_meta( $id, 'status', true ), 'GET changes nothing' );
		$this->assertSame( 200, $this->page( 'POST', $q, array( 'ita_do' => 'confirm' ) )['status'] );
		$this->assertSame( 'confirmed', get_post_meta( $id, 'status', true ) );
		$this->assertSame( '', (string) get_post_meta( $id, 'unsubscribed_at', true ) );
		$this->assertSame( '', (string) get_post_meta( $id, 'resubscribe_requested_at', true ) );
		$this->assertCount( 1, ita_subscribers() );
	}

	public function test_a_throwing_mailer_is_counted_without_the_address_and_the_other_queued_mails_still_go(): void {
		$a = $this->make( 'pending', 'a@example.com' );
		$b = $this->make( 'pending', 'b@example.com' );
		$thrower = static function ( $short, $atts ) {
			if ( in_array( 'a@example.com', (array) $atts['to'], true ) ) {
				throw new RuntimeException( 'smtp exploded for a@example.com' );
			}
			return null;
		};
		add_filter( 'pre_wp_mail', $thrower, 5, 2 );
		$GLOBALS['ideatoapps_newsletter_queue'] = array( $a, $b );
		ideatoapps_newsletter_flush_queue();
		remove_filter( 'pre_wp_mail', $thrower, 5 );
		$this->assertCount( 1, $this->mails, 'the second mail was still sent' );
		$this->assertSame( array( 'b@example.com' ), (array) $this->mails[0]['to'] );
		$this->assertSame( '', (string) get_post_meta( $a, 'confirmation_sent_at', true ) );
		$this->assertNotSame( '', (string) get_post_meta( $b, 'confirmation_sent_at', true ) );
		$this->assertStringNotContainsString( 'a@example.com', ideatoapps_newsletter_mail_failure_notice() . wp_json_encode( get_option( 'ideatoapps_newsletter_mail_failed_at' ) ) );
	}

	public function test_an_old_confirm_link_cannot_re_confirm_after_an_unsubscribe_even_if_a_comeback_was_once_requested(): void {
		$id = $this->make( 'confirmed', 'a@example.com' );
		$cq = $this->query( $id, 'confirm' );
		$uq = $this->query( $id, 'unsubscribe' );
		update_post_meta( $id, 'resubscribe_requested_at', gmdate( 'c' ) ); // left over from an earlier request.
		$this->page( 'POST', $uq, array( 'ita_do' => 'unsubscribe' ) );
		$this->assertSame( '', (string) get_post_meta( $id, 'resubscribe_requested_at', true ), 'unsubscribing withdraws any comeback request' );
		$this->assertSame( 400, $this->page( 'POST', $cq, array( 'ita_do' => 'confirm' ) )['status'] );
		$this->assertSame( 'unsubscribed', get_post_meta( $id, 'status', true ) );
	}

	public function test_the_confirmation_is_sent_after_the_response_not_during_it(): void {
		$res = $this->signup( 'async@example.com', true, false );
		$this->assertSame( 200, $res->get_status() );
		$this->assertSame( array(), $this->mails, 'no mail while the request is being answered' );
		$this->assertNotFalse( has_action( 'shutdown', 'ideatoapps_newsletter_flush_queue' ), 'sent from the shutdown hook' );
		$this->assertSame( array( $this->id_of( 'async@example.com' ) ), $GLOBALS['ideatoapps_newsletter_queue'] );
		ideatoapps_newsletter_flush_queue();
		$this->assertCount( 1, $this->mails );
		$this->assertSame( array(), $GLOBALS['ideatoapps_newsletter_queue'] );
	}

	public function test_confirmed_throttled_new_and_failing_addresses_all_get_the_identical_answer(): void {
		$this->make( 'confirmed', 'conf@example.com' );
		$this->signup( 'throttled@example.com' );
		$answers = array();
		foreach ( array( 'conf@example.com', 'throttled@example.com', 'fresh@example.com' ) as $e ) {
			$res       = $this->signup( $e );
			$answers[] = array( $res->get_status(), $res->get_data() );
		}
		$this->mail_ok = false;
		$res           = $this->signup( 'broken@example.com' );
		$answers[]     = array( $res->get_status(), $res->get_data() );
		$this->assertSame( 200, $answers[0][0] );
		$this->assertCount( 1, array_unique( array_map( 'serialize', $answers ) ), 'same status and body whatever the list state or mail result' );
	}

	public function test_a_failed_send_keeps_the_row_pending_records_the_failure_without_the_address_and_does_not_start_the_throttle(): void {
		$this->mail_ok = false;
		$this->signup( 'f@example.com' );
		$id = $this->id_of( 'f@example.com' );
		$this->assertSame( 'pending', get_post_meta( $id, 'status', true ) );
		$this->assertSame( '', (string) get_post_meta( $id, 'confirmation_sent_at', true ) );
		$this->assertSame( 1, (int) get_option( 'ideatoapps_newsletter_mail_failures' ) );
		$notice = ideatoapps_newsletter_mail_failure_notice();
		$this->assertStringContainsString( '1', $notice );
		$this->assertStringNotContainsString( 'f@example.com', $notice );
		$this->assertStringNotContainsString( 'f@example.com', wp_json_encode( get_option( 'ideatoapps_newsletter_mail_failures' ) ) );
		$this->mail_ok = true;
		$this->signup( 'f@example.com' );
		$this->assertCount( 2, $this->mails, 'the retry was not throttled' );
		$this->assertSame( '', ideatoapps_newsletter_mail_failure_notice(), 'a successful send clears the notice' );
	}

	public function test_the_failure_notice_shows_on_the_settings_and_list_pages(): void {
		update_option( 'ideatoapps_newsletter_mail_failures', 3 );
		wp_set_current_user( self::make_user( 'administrator' ) );
		foreach ( array( 'ideatoapps_render_settings_page', 'ideatoapps_render_export_page' ) as $fn ) {
			ob_start();
			$fn();
			$this->assertStringContainsString( 'could not be sent', (string) ob_get_clean(), $fn );
		}
	}

	public function test_signup_still_needs_the_nonce_and_the_rate_limit(): void {
		$this->assertSame( 403, $this->signup( 'a@example.com', false )->get_status() );
		for ( $i = 1; $i <= 5; $i++ ) {
			$this->assertSame( 200, $this->signup( "u$i@example.com" )->get_status() );
		}
		$this->assertSame( 429, $this->signup( 'u6@example.com' )->get_status() );
	}

	public function test_rows_from_the_old_single_step_form_are_pending_never_confirmed(): void {
		$old = wp_insert_post( array( 'post_type' => 'ita_subscriber', 'post_status' => 'private', 'post_title' => 'old@example.com', 'meta_input' => array( 'email' => 'old@example.com', 'consent_at' => '2026-01-01T00:00:00+00:00' ) ) );
		$this->assertSame( 'pending', ideatoapps_subscriber_status( $old ), 'a row without a status reads as pending' );
		delete_option( 'ideatoapps_newsletter_schema' );
		ideatoapps_newsletter_migrate();
		$this->assertSame( 'pending', get_post_meta( $old, 'status', true ) );
		$this->assertSame( '', (string) get_post_meta( $old, 'confirmed_at', true ) );
		$this->assertStringNotContainsString( 'old@example.com', ita_subscribers_csv() );
		$kept = $this->make( 'confirmed', 'keep@example.com' );
		delete_option( 'ideatoapps_newsletter_schema' );
		ideatoapps_newsletter_migrate();
		$this->assertSame( 'confirmed', get_post_meta( $kept, 'status', true ), 'the migration never touches a row that has a status' );
	}

	// ---- tokens --------------------------------------------------------------------------------------------------

	public function test_tokens_are_bound_to_the_subscriber_and_the_action(): void {
		$a = $this->make( 'pending', 'a@example.com' );
		$b = $this->make( 'pending', 'b@example.com' );
		$c = ideatoapps_newsletter_token( $a, 'confirm' );
		$u = ideatoapps_newsletter_token( $a, 'unsubscribe' );
		$this->assertSame( 'ok', ideatoapps_newsletter_token_check( $a, 'confirm', $c ) );
		$this->assertSame( 'ok', ideatoapps_newsletter_token_check( $a, 'unsubscribe', $u ) );
		$this->assertSame( 'invalid', ideatoapps_newsletter_token_check( $b, 'confirm', $c ), 'another subscriber' );
		$this->assertSame( 'invalid', ideatoapps_newsletter_token_check( $a, 'unsubscribe', $c ), 'a confirm token cannot unsubscribe' );
		$this->assertSame( 'invalid', ideatoapps_newsletter_token_check( $a, 'confirm', $u ), 'an unsubscribe token cannot confirm' );
		foreach ( array( '', 'x', substr( $c, 0, -1 ), $c . '0', strtoupper( $c ), '0.' . substr( $c, strpos( $c, '.' ) + 1 ), str_repeat( 'a', 64 ) ) as $bad ) {
			$this->assertSame( 'invalid', ideatoapps_newsletter_token_check( $a, 'confirm', $bad ), $bad );
		}
		$this->assertSame( 'invalid', ideatoapps_newsletter_token_check( $b, 'unsubscribe', $u ), 'an unsubscribe token of another subscriber' );
		$this->assertSame( 'invalid', ideatoapps_newsletter_token_check( $a, 'unsubscribe', str_repeat( 'a', 64 ) ), 'right shape, wrong MAC' );
		$this->assertSame( 'invalid', ideatoapps_newsletter_token_check( $a, 'unsubscribe', $u . "\n" ), 'a trailing newline is not part of the token' );
		$this->assertSame( 'invalid', ideatoapps_newsletter_token_check( $a, 'delete', $u ), 'only confirm and unsubscribe exist' );
	}

	public function test_the_token_is_an_hmac_sha256_keyed_with_the_auth_salt(): void {
		$u = ideatoapps_newsletter_token( 7, 'unsubscribe' );
		$this->assertSame( hash_hmac( 'sha256', 'ideatoapps-newsletter|7|unsubscribe|', wp_salt( 'auth' ) ), $u );
		$c  = ideatoapps_newsletter_token( 7, 'confirm', 1000 );
		list( $ts, $mac ) = explode( '.', $c );
		$this->assertSame( '1000', $ts );
		$this->assertSame( hash_hmac( 'sha256', 'ideatoapps-newsletter|7|confirm|1000', wp_salt( 'auth' ) ), $mac );
	}

	public function test_confirm_tokens_expire_after_seven_days_and_unsubscribe_tokens_never_do(): void {
		$id = 42;
		$t0 = 1_800_000_000;
		$c  = ideatoapps_newsletter_token( $id, 'confirm', $t0 );
		$this->assertSame( 'ok', ideatoapps_newsletter_token_check( $id, 'confirm', $c, $t0 + 7 * DAY_IN_SECONDS ) );
		$this->assertSame( 'expired', ideatoapps_newsletter_token_check( $id, 'confirm', $c, $t0 + 7 * DAY_IN_SECONDS + 1 ) );
		$this->assertSame( 'invalid', ideatoapps_newsletter_token_check( $id, 'confirm', $c, $t0 - HOUR_IN_SECONDS ), 'a token from the future' );
		$this->assertSame( 'ok', ideatoapps_newsletter_token_check( $id, 'unsubscribe', ideatoapps_newsletter_token( $id, 'unsubscribe' ), $t0 + 20 * YEAR_IN_SECONDS ) );
		// An attacker cannot refresh a stale token by editing its timestamp: the MAC covers it.
		list( , $mac ) = explode( '.', $c );
		$this->assertSame( 'invalid', ideatoapps_newsletter_token_check( $id, 'confirm', ( $t0 + 8 * DAY_IN_SECONDS ) . '.' . $mac, $t0 + 8 * DAY_IN_SECONDS ) );
	}

	// ---- the front-end page --------------------------------------------------------------------------------------

	public function test_get_shows_a_button_and_changes_nothing_so_link_scanners_cannot_confirm_or_unsubscribe(): void {
		$p = $this->make( 'pending' );
		$res = $this->page( 'GET', $this->query( $p, 'confirm' ) );
		$this->assertSame( 200, $res['status'] );
		$this->assertSame( 'confirm_form', $res['view'] );
		$html = ideatoapps_newsletter_page_html( $res, $this->query( $p, 'confirm' ) );
		$this->assertMatchesRegularExpression( '/<form[^>]+method="post"/', $html );
		$this->assertStringContainsString( 'data-testid="newsletter-confirm-button"', $html );
		$this->assertSame( 'pending', get_post_meta( $p, 'status', true ) );
		foreach ( array( 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'PATCH' ) as $method ) {
			$this->page( $method, $this->query( $p, 'confirm' ), array( 'ita_do' => 'confirm' ) );
			$this->assertSame( 'pending', get_post_meta( $p, 'status', true ), $method );
		}
		$c = $this->make( 'confirmed', 'c@example.com' );
		$this->page( 'GET', $this->query( $c, 'unsubscribe' ), array( 'ita_do' => 'unsubscribe' ) );
		$this->page( 'GET', $this->query( $c, 'unsubscribe' ) );
		$this->assertSame( 'confirmed', get_post_meta( $c, 'status', true ) );
	}

	public function test_post_with_a_good_token_confirms_stamps_the_time_and_is_idempotent(): void {
		$p   = $this->make( 'pending' );
		$q   = $this->query( $p, 'confirm' );
		$res = $this->page( 'POST', $q, array( 'ita_do' => 'confirm' ) );
		$this->assertSame( 200, $res['status'] );
		$this->assertSame( 'confirmed', $res['view'] );
		$this->assertSame( 'confirmed', get_post_meta( $p, 'status', true ) );
		$at = (string) get_post_meta( $p, 'confirmed_at', true );
		$this->assertMatchesRegularExpression( '/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/', $at );
		$again = $this->page( 'POST', $q, array( 'ita_do' => 'confirm' ) );
		$this->assertSame( 200, $again['status'] );
		$this->assertSame( $at, (string) get_post_meta( $p, 'confirmed_at', true ), 'the first confirmation time is kept' );
		$this->assertSame( array(), $this->mails, 'confirming sends no email' );
	}

	public function test_post_with_a_bad_wrong_action_or_expired_token_changes_nothing(): void {
		$p = $this->make( 'pending' );
		$q = $this->query( $p, 'confirm' );
		$bad = $q;
		$bad['t'] = substr( $q['t'], 0, -2 ) . ( 'aa' === substr( $q['t'], -2 ) ? 'bb' : 'aa' );
		$res = $this->page( 'POST', $bad, array( 'ita_do' => 'confirm' ) );
		$this->assertSame( 400, $res['status'] );
		$this->assertSame( 'invalid', $res['view'] );
		$u = $this->query( $p, 'unsubscribe' );
		$this->assertSame( 400, $this->page( 'POST', array( 'ita_newsletter' => 'confirm', 'sid' => $p, 't' => $u['t'] ), array( 'ita_do' => 'confirm' ) )['status'] );
		$this->assertSame( 400, $this->page( 'POST', array( 'ita_newsletter' => 'unsubscribe', 'sid' => $p, 't' => $q['t'] ), array( 'ita_do' => 'unsubscribe' ) )['status'] );
		$_SERVER['REMOTE_ADDR'] = '198.51.100.' . wp_rand( 1, 250 ); // a fresh rate-limit budget.
		$this->assertSame( 400, $this->page( 'POST', $q, array( 'ita_do' => 'unsubscribe' ) )['status'], 'the button must match the link' );
		$old = ideatoapps_newsletter_token( $p, 'confirm', time() - 8 * DAY_IN_SECONDS );
		$res = $this->page( 'POST', array( 'ita_newsletter' => 'confirm', 'sid' => $p, 't' => $old ), array( 'ita_do' => 'confirm' ) );
		$this->assertSame( 400, $res['status'] );
		$this->assertSame( 'expired', $res['view'] );
		$this->assertSame( 400, $this->page( 'POST', array( 'ita_newsletter' => 'confirm', 'sid' => 999999, 't' => $q['t'] ), array( 'ita_do' => 'confirm' ) )['status'] );
		$this->assertSame( 400, $this->page( 'POST', array( 'ita_newsletter' => 'confirm', 'sid' => array( 1 ), 't' => array( 'x' ) ), array( 'ita_do' => 'confirm' ) )['status'] );
		$this->assertSame( 'pending', get_post_meta( $p, 'status', true ) );
		$this->assertSame( '', (string) get_post_meta( $p, 'confirmed_at', true ) );
	}

	public function test_a_token_for_a_post_of_another_type_is_refused(): void {
		$page = wp_insert_post( array( 'post_type' => 'page', 'post_title' => 'x', 'post_status' => 'publish' ) );
		$res  = $this->page( 'POST', array( 'ita_newsletter' => 'unsubscribe', 'sid' => $page, 't' => ideatoapps_newsletter_token( $page, 'unsubscribe' ) ), array( 'ita_do' => 'delete' ) );
		$this->assertSame( 'gone', $res['view'], 'a token for something that is not a subscriber row does nothing' );
		$this->assertNotNull( get_post( $page ), 'only subscriber rows can be touched' );
		$this->assertSame( 'publish', get_post_status( $page ) );
	}

	public function test_unsubscribe_keeps_only_the_email_status_and_time_and_the_page_says_so(): void {
		$c = $this->make( 'confirmed' );
		update_post_meta( $c, 'confirmed_at', gmdate( 'c' ) );
		$q    = $this->query( $c, 'unsubscribe' );
		$form = ideatoapps_newsletter_page_html( $this->page( 'GET', $q ), $q );
		$this->assertStringContainsString( 'data-testid="newsletter-unsubscribe-button"', $form );
		$this->assertStringContainsString( 'data-testid="newsletter-delete-button"', $form );
		$this->assertStringContainsString( 'Unsubscribe and delete my data', $form );
		$this->assertMatchesRegularExpression( '/keep(s)? (only )?your email address/i', $form, 'says what plain Unsubscribe keeps' );
		$res = $this->page( 'POST', $q, array( 'ita_do' => 'unsubscribe' ) );
		$this->assertSame( 200, $res['status'] );
		$this->assertSame( 'unsubscribed', $res['view'] );
		$this->assertSame( 'unsubscribed', get_post_meta( $c, 'status', true ) );
		$this->assertMatchesRegularExpression( '/^\d{4}-\d\d-\d\dT/', (string) get_post_meta( $c, 'unsubscribed_at', true ) );
		$this->assertSame( 'ann@example.com', get_post_meta( $c, 'email', true ), 'the address is kept so the opt-out can be honoured' );
		$this->assertStringNotContainsString( 'ann@example.com', ideatoapps_newsletter_page_html( $res, $q ), 'no address is shown on the page' );
		$this->assertStringNotContainsString( 'ann@example.com', ita_subscribers_csv(), 'and it is not exported' );
	}

	public function test_unsubscribe_and_delete_hard_deletes_the_row_and_its_meta(): void {
		global $wpdb;
		$c = $this->make( 'confirmed' );
		$q = $this->query( $c, 'unsubscribe' );
		$res = $this->page( 'POST', $q, array( 'ita_do' => 'delete' ) );
		$this->assertSame( 200, $res['status'] );
		$this->assertSame( 'deleted', $res['view'] );
		$this->assertNull( get_post( $c ), 'not even in the trash' );
		$this->assertSame( 0, (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE post_id = %d", $c ) ) );
		$again = $this->page( 'POST', $q, array( 'ita_do' => 'delete' ) );
		$this->assertSame( 'gone', $again['view'], 'a second click has nothing left to delete' );
	}

	public function test_an_unsubscribed_row_cannot_be_confirmed_with_an_old_link(): void {
		$u = $this->make( 'unsubscribed' );
		$res = $this->page( 'POST', $this->query( $u, 'confirm' ), array( 'ita_do' => 'confirm' ) );
		$this->assertSame( 'unsubscribed', get_post_meta( $u, 'status', true ) );
		$this->assertSame( 400, $res['status'] );
	}

	public function test_confirm_unsubscribe_and_delete_posts_are_rate_limited_but_page_views_are_not(): void {
		$p = $this->make( 'pending' );
		$q = $this->query( $p, 'confirm' );
		for ( $i = 1; $i <= 12; $i++ ) {
			$this->assertSame( 200, $this->page( 'GET', $q )['status'], 'views are free' );
		}
		$codes = array();
		for ( $i = 1; $i <= 6; $i++ ) {
			$codes[] = $this->page( 'POST', array( 'ita_newsletter' => 'confirm', 'sid' => $p, 't' => 'bad' ), array( 'ita_do' => 'confirm' ) )['status'];
		}
		$this->assertSame( array( 400, 400, 400, 400, 400, 429 ), $codes, 'bad guesses are throttled too' );
		$res = $this->page( 'POST', $q, array( 'ita_do' => 'confirm' ) );
		$this->assertSame( 429, $res['status'] );
		$this->assertSame( 'pending', get_post_meta( $p, 'status', true ), 'a throttled request changes nothing' );
		$_SERVER['REMOTE_ADDR'] = '198.51.100.44';
		$this->assertSame( 200, $this->page( 'POST', $q, array( 'ita_do' => 'confirm' ) )['status'], 'another visitor has their own budget' );
	}

	public function test_the_page_works_for_logged_out_visitors_without_any_nonce(): void {
		wp_set_current_user( 0 );
		$p = $this->make( 'pending' );
		$this->assertSame( 200, $this->page( 'POST', $this->query( $p, 'confirm' ), array( 'ita_do' => 'confirm' ) )['status'] );
		$this->assertSame( 'confirmed', get_post_meta( $p, 'status', true ) );
	}

	public function test_the_page_is_noindex_no_store_and_leaks_no_referrer(): void {
		$h = ideatoapps_newsletter_page_headers();
		$this->assertStringContainsString( 'noindex', $h['X-Robots-Tag'] );
		$this->assertStringContainsString( 'no-store', $h['Cache-Control'] );
		$this->assertSame( 'no-referrer', $h['Referrer-Policy'], 'the token is in the URL' );
	}

	public function test_page_output_is_escaped_and_never_prints_an_email_address(): void {
		$p = $this->make( 'pending', 'x@example.com' );
		$q = $this->query( $p, 'confirm' );
		foreach ( array( 'confirm_form', 'confirmed', 'invalid', 'expired', 'gone', 'deleted', 'unsubscribed', 'rate_limited' ) as $view ) {
			$html = ideatoapps_newsletter_page_html( array( 'status' => 200, 'view' => $view, 'action' => 'confirm', 'id' => $p ), $q );
			$this->assertDoesNotMatchRegularExpression( '/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/', $html, $view );
		}
		$evil = array( 'ita_newsletter' => 'confirm', 'sid' => $p, 't' => '"><script>alert(1)</script>' );
		foreach ( array( 'confirm_form', 'invalid' ) as $view ) {
			$html = ideatoapps_newsletter_page_html( array( 'status' => 200, 'view' => $view, 'action' => 'confirm', 'id' => $p ), $evil );
			$this->assertStringNotContainsString( 'alert(1)', $html, 'the token never reaches the markup' );
		}
	}

	public function test_the_form_posts_to_the_browsers_own_url_so_a_cache_cannot_swap_the_token(): void {
		$p    = $this->make( 'pending' );
		$q    = $this->query( $p, 'confirm' );
		$html = ideatoapps_newsletter_page_html( $this->page( 'GET', $q ), $q );
		$this->assertMatchesRegularExpression( '/<form method="post">/', $html );
		$this->assertStringNotContainsString( 'action=', $html );
		$this->assertStringNotContainsString( $q['t'], $html );
	}

	public function test_subscriber_rows_are_not_in_the_core_xml_export(): void {
		$this->assertFalse( get_post_type_object( 'ita_subscriber' )->can_export, 'Tools > Export would dump every address' );
	}

	public function test_unsubscribe_still_works_while_the_signup_switch_is_off(): void {
		$c = $this->make( 'confirmed' );
		delete_option( 'ideatoapps_newsletter_enabled' );
		$res = $this->page( 'POST', $this->query( $c, 'unsubscribe' ), array( 'ita_do' => 'unsubscribe' ) );
		$this->assertSame( 200, $res['status'] );
		$this->assertSame( 'unsubscribed', get_post_meta( $c, 'status', true ) );
	}

	public function test_only_confirmed_subscribers_are_in_the_csv_with_status_and_confirmed_at(): void {
		$c = $this->make( 'confirmed', 'yes@example.com' );
		update_post_meta( $c, 'confirmed_at', '2026-02-02T10:00:00+00:00' );
		$this->make( 'pending', 'wait@example.com' );
		$this->make( 'unsubscribed', 'no@example.com' );
		$f = $this->make( 'confirmed', '+formula@example.com' );
		$csv = ita_subscribers_csv();
		$this->assertStringStartsWith( "email,consent_at,confirmed_at,status\n", $csv );
		$this->assertStringContainsString( 'yes@example.com,', $csv );
		$this->assertStringContainsString( '2026-02-02T10:00:00+00:00,confirmed', $csv );
		$this->assertStringNotContainsString( 'wait@example.com', $csv );
		$this->assertStringNotContainsString( 'no@example.com', $csv );
		$this->assertStringContainsString( "'+formula@example.com", $csv, 'formula protection is kept' );
		$this->assertCount( 2, ita_subscribers(), 'the mailable list is the confirmed rows' );
	}

	public function test_a_confirmed_address_can_never_come_from_a_missing_or_odd_status(): void {
		foreach ( array( '', 'CONFIRMED', 'yes', 'confirmed ' ) as $odd ) {
			$id = $this->make( $odd, 'odd' . wp_rand() . '@example.com' );
			$this->assertSame( 'pending', ideatoapps_subscriber_status( $id ), "[$odd]" );
		}
		$this->assertSame( array(), ita_subscribers() );
	}

	// ---- the theme part ------------------------------------------------------------------------------------------

	private function render_part(): string {
		ob_start();
		ideatoapps_part( 'newsletter' );
		return (string) ob_get_clean();
	}

	public function test_form_says_only_that_a_confirmation_email_is_sent_and_nothing_until_confirmed(): void {
		$html = $this->render_part();
		$this->assertStringContainsString( 'type="email"', $html );
		$this->assertMatchesRegularExpression( '/confirmation email/i', $html );
		$this->assertMatchesRegularExpression( '/nothing is (sent|added)[^<]*until you confirm/i', $html );
		$this->assertDoesNotMatchRegularExpression( '/\b(weekly|daily|monthly|tips|news about|updates about|newsletter is sent)\b/i', $html, 'no claims about frequency or content' );
		$this->assertDoesNotMatchRegularExpression( '/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/', $html );
		$this->assertStringNotContainsString( 'not open yet', $html );
	}

	public function test_while_off_the_theme_says_sign_up_is_not_open_yet_and_shows_no_form(): void {
		delete_option( 'ideatoapps_newsletter_enabled' );
		$html = $this->render_part();
		$this->assertStringContainsString( 'Sign-up is not open yet', $html );
		$this->assertStringContainsString( 'data-testid="newsletter"', $html );
		$this->assertStringNotContainsString( '<form', $html );
		$this->assertStringNotContainsString( 'type="email"', $html );
		$this->assertDoesNotMatchRegularExpression( '/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/', $html );
	}
}
