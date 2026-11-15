<?php
final class ContactTest extends WPTestCase {
	/** @var array<int, array<string, mixed>> */
	private array $mails = array();

	protected function setUp(): void {
		parent::setUp();
		$_SERVER['REMOTE_ADDR'] = '203.0.113.' . wp_rand( 1, 250 );
		$this->mails            = array();
		add_filter(
			'pre_wp_mail',
			function ( $short, $atts ) {
				$this->mails[] = $atts;
				return true;
			},
			10,
			2
		);
	}

	protected function tearDown(): void {
		delete_option( 'ideatoapps_contact_enabled' );
		delete_transient( ideatoapps_rate_limit_key( 'contact' ) );
		unset( $_SERVER['REMOTE_ADDR'] );
		parent::tearDown();
	}

	private function send( array $body = array(), bool $nonce = true ): WP_REST_Response {
		$req = new WP_REST_Request( 'POST', '/ideatoapps/v1/contact' );
		$req->set_header( 'Content-Type', 'application/json' );
		if ( $nonce ) {
			$req->set_header( 'X-WP-Nonce', wp_create_nonce( 'wp_rest' ) );
		}
		$req->set_body( wp_json_encode( $body + array( 'name' => 'Ann', 'email' => 'ann@example.com', 'message' => 'Hello there', 'website' => '' ) ) );
		return rest_do_request( $req );
	}

	public function test_disabled_by_default(): void {
		$this->assertFalse( ideatoapps_contact_enabled() );
		$this->assertFalse( (bool) get_option( 'ideatoapps_contact_enabled', false ) );
	}

	public function test_503_not_yet_available_while_disabled_and_no_mail(): void {
		$res = $this->send();
		$this->assertSame( 503, $res->get_status() );
		$this->assertStringContainsString( 'not yet available', (string) $res->get_data()['message'] );
		$this->assertSame( array(), $this->mails );
		$this->assertSame( 503, $this->send( array( 'website' => 'http://spam' ) )->get_status(), 'disabled wins over everything' );
	}

	public function test_enabled_sends_one_mail_to_the_site_admin_with_a_reply_to(): void {
		update_option( 'ideatoapps_contact_enabled', true );
		$res = $this->send( array( 'name' => "Ann\r\nBcc: evil@example.com", 'message' => "Line one\nLine two" ) );
		$this->assertSame( 200, $res->get_status() );
		$this->assertCount( 1, $this->mails );
		$mail = $this->mails[0];
		$this->assertSame( array( get_option( 'admin_email' ) ), (array) $mail['to'] );
		$headers = implode( "\n", (array) $mail['headers'] );
		$this->assertStringContainsString( 'Reply-To:', $headers );
		$this->assertStringContainsString( 'ann@example.com', $headers );
		$this->assertStringNotContainsString( 'evil@example.com', $headers, 'header injection through the name' );
		$this->assertStringContainsString( 'Line two', $mail['message'] );
	}

	public function test_filled_honeypot_is_400_and_sends_nothing(): void {
		update_option( 'ideatoapps_contact_enabled', true );
		$this->assertSame( 400, $this->send( array( 'website' => 'https://spam.example' ) )->get_status() );
		$this->assertSame( array(), $this->mails );
	}

	public function test_validation_and_nonce(): void {
		update_option( 'ideatoapps_contact_enabled', true );
		$this->assertSame( 403, $this->send( array(), false )->get_status() );
		foreach ( array( array( 'name' => '' ), array( 'email' => 'bad' ), array( 'message' => '   ' ), array( 'message' => str_repeat( 'x', 5001 ) ) ) as $bad ) {
			$this->assertSame( 400, $this->send( $bad )->get_status(), wp_json_encode( $bad ) );
		}
		$this->assertSame( array(), $this->mails );
	}

	public function test_rate_limited_to_five_a_minute_per_ip(): void {
		update_option( 'ideatoapps_contact_enabled', true );
		for ( $i = 1; $i <= 5; $i++ ) {
			$this->assertSame( 200, $this->send()->get_status(), "request $i" );
		}
		$this->assertSame( 429, $this->send()->get_status() );
		$this->assertCount( 5, $this->mails );
	}

	public function test_setting_is_saved_from_the_settings_form_for_admins_only(): void {
		wp_set_current_user( self::make_user( 'administrator' ) );
		$post = array( '_wpnonce' => wp_create_nonce( 'ideatoapps_save_settings' ), 'contact_enabled' => '1' );
		ideatoapps_process_settings( $post );
		$this->assertTrue( ideatoapps_contact_enabled() );
		unset( $post['contact_enabled'] );
		ideatoapps_process_settings( $post );
		$this->assertFalse( ideatoapps_contact_enabled(), 'an unchecked box turns it off' );
	}

	public function test_no_email_address_in_page_templates_or_contact_copy(): void {
		$theme = get_template_directory();
		foreach ( array_merge( glob( "$theme/*.php" ), glob( "$theme/parts/*.php" ), glob( "$theme/inc/*.php" ) ) as $file ) {
			$this->assertDoesNotMatchRegularExpression( '/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/', (string) file_get_contents( $file ), basename( $file ) );
		}
	}
}
