<?php
final class NewsletterTest extends WPTestCase {
	protected function setUp(): void {
		parent::setUp();
		$_SERVER['REMOTE_ADDR'] = '203.0.113.' . wp_rand( 1, 250 );
	}

	protected function tearDown(): void {
		delete_transient( ideatoapps_rate_limit_key( 'newsletter' ) );
		unset( $_SERVER['REMOTE_ADDR'] );
		parent::tearDown();
	}

	private function post( array $body, bool $nonce = true ): WP_REST_Response {
		$req = new WP_REST_Request( 'POST', '/ideatoapps/v1/newsletter' );
		$req->set_header( 'Content-Type', 'application/json' );
		if ( $nonce ) {
			$req->set_header( 'X-WP-Nonce', wp_create_nonce( 'wp_rest' ) );
		}
		$req->set_body( wp_json_encode( $body ) );
		return rest_do_request( $req );
	}

	private function subscribers(): array {
		return get_posts( array( 'post_type' => 'ita_subscriber', 'post_status' => 'any', 'numberposts' => -1 ) );
	}

	public function test_route_is_registered_and_the_home_part_is_enabled_by_it(): void {
		$this->assertArrayHasKey( '/ideatoapps/v1/newsletter', rest_get_server()->get_routes() );
		$this->assertTrue( ideatoapps_newsletter_available() );
		remove_filter( 'ideatoapps_newsletter_available', 'ideatoapps_newsletter_route_exists' );
		$this->assertFalse( ideatoapps_newsletter_available(), 'only the plugin filter turns it on' );
		add_filter( 'ideatoapps_newsletter_available', 'ideatoapps_newsletter_route_exists' );
	}

	public function test_form_part_has_consent_nonce_and_promises_no_mail(): void {
		ob_start();
		ideatoapps_part( 'newsletter' );
		$html = (string) ob_get_clean();
		$this->assertMatchesRegularExpression( '/<input[^>]+type="checkbox"[^>]+name="consent"[^>]+required/', $html );
		$this->assertMatchesRegularExpression( '/data-nonce="[a-f0-9]{10}"/', $html );
		$this->assertStringContainsString( 'type="email"', $html );
		$this->assertStringNotContainsStringIgnoringCase( 'unsubscribe', $html );
		$this->assertDoesNotMatchRegularExpression( '/\b(we will (send|email)|emails? (you|will)|newsletter is sent)\b/i', $html );
		$this->assertDoesNotMatchRegularExpression( '/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/', $html );
	}

	public function test_valid_subscription_is_stored_with_consent_at(): void {
		$before = time();
		$res    = $this->post( array( 'email' => 'Ann@Example.com', 'consent' => true ) );
		$this->assertSame( 200, $res->get_status() );
		$subs = $this->subscribers();
		$this->assertCount( 1, $subs );
		$this->assertSame( 'ann@example.com', get_post_meta( $subs[0]->ID, 'email', true ) );
		$at = (string) get_post_meta( $subs[0]->ID, 'consent_at', true );
		$this->assertMatchesRegularExpression( '/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/', $at );
		$this->assertGreaterThanOrEqual( $before - 1, strtotime( $at ) );
		$this->assertLessThanOrEqual( time() + 1, strtotime( $at ) );
		$this->assertStringNotContainsStringIgnoringCase( 'sent', wp_json_encode( $res->get_data() ), 'no promise that mail is sent' );
	}

	public function test_missing_or_false_consent_is_rejected_and_nothing_is_stored(): void {
		$this->assertSame( 400, $this->post( array( 'email' => 'a@example.com' ) )->get_status() );
		$this->assertSame( 400, $this->post( array( 'email' => 'a@example.com', 'consent' => false ) )->get_status() );
		$this->assertSame( 400, $this->post( array( 'email' => 'a@example.com', 'consent' => 'false' ) )->get_status() );
		$this->assertSame( array(), $this->subscribers() );
	}

	public function test_invalid_email_is_rejected(): void {
		foreach ( array( '', 'nope', 'a@', '<script>@x.com', 'a b@example.com' ) as $bad ) {
			$this->assertSame( 400, $this->post( array( 'email' => $bad, 'consent' => true ) )->get_status(), $bad );
			delete_transient( ideatoapps_rate_limit_key( 'newsletter' ) );
		}
		$this->assertSame( array(), $this->subscribers() );
	}

	public function test_missing_or_bad_nonce_is_rejected(): void {
		$this->assertSame( 403, $this->post( array( 'email' => 'a@example.com', 'consent' => true ), false )->get_status() );
		$req = new WP_REST_Request( 'POST', '/ideatoapps/v1/newsletter' );
		$req->set_header( 'X-WP-Nonce', 'deadbeef00' );
		$req->set_body_params( array( 'email' => 'a@example.com', 'consent' => true ) );
		$this->assertSame( 403, rest_do_request( $req )->get_status() );
		$this->assertSame( array(), $this->subscribers() );
	}

	public function test_sixth_request_in_a_minute_from_one_ip_is_429(): void {
		for ( $i = 1; $i <= 5; $i++ ) {
			$this->assertSame( 200, $this->post( array( 'email' => "u$i@example.com", 'consent' => true ) )->get_status(), "request $i" );
		}
		$this->assertSame( 429, $this->post( array( 'email' => 'u6@example.com', 'consent' => true ) )->get_status() );
		$this->assertCount( 5, $this->subscribers() );
		$_SERVER['REMOTE_ADDR'] = '198.51.100.7';
		$this->assertSame( 200, $this->post( array( 'email' => 'other@example.com', 'consent' => true ) )->get_status(), 'another IP has its own budget' );
		delete_transient( ideatoapps_rate_limit_key( 'newsletter' ) );
	}

	public function test_same_email_twice_is_stored_once_and_looks_identical(): void {
		$a = $this->post( array( 'email' => 'dup@example.com', 'consent' => true ) );
		$b = $this->post( array( 'email' => 'DUP@example.com', 'consent' => true ) );
		$this->assertSame( 200, $b->get_status() );
		$this->assertSame( $a->get_data(), $b->get_data() );
		$this->assertCount( 1, $this->subscribers() );
	}

	public function test_subscribers_are_not_public_and_not_in_rest(): void {
		$pt = get_post_type_object( 'ita_subscriber' );
		$this->assertFalse( $pt->public );
		$this->assertFalse( $pt->show_in_rest );
		$this->assertFalse( $pt->publicly_queryable );
		$this->post( array( 'email' => 'p@example.com', 'consent' => true ) );
		$this->assertSame( 'private', $this->subscribers()[0]->post_status );
	}

	public function test_csv_export_has_header_rows_and_neutralises_formulas(): void {
		$this->post( array( 'email' => 'one@example.com', 'consent' => true ) );
		$this->post( array( 'email' => '+evil@example.com', 'consent' => true ) );
		$csv = ita_subscribers_csv();
		$this->assertStringStartsWith( "email,consent_at\n", $csv );
		$this->assertStringContainsString( 'one@example.com,', $csv );
		$this->assertStringNotContainsString( "\n+evil", $csv );
		$this->assertStringContainsString( "'+evil@example.com", $csv );
	}

	public function test_export_requires_manage_options_and_a_nonce(): void {
		$this->assertFalse( ideatoapps_can_export_subscribers( 'x' ) );
		wp_set_current_user( self::make_user( 'editor' ) );
		$this->assertFalse( ideatoapps_can_export_subscribers( wp_create_nonce( 'ideatoapps_export_subscribers' ) ) );
		wp_set_current_user( self::make_user( 'administrator' ) );
		$this->assertFalse( ideatoapps_can_export_subscribers( 'bad' ) );
		$this->assertTrue( ideatoapps_can_export_subscribers( wp_create_nonce( 'ideatoapps_export_subscribers' ) ) );
	}
}
