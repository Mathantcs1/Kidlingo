<?php
require_once __DIR__ . '/SeoTestCase.php';

/**
 * Sender address for the plugin's own emails (newsletter confirmation, reading link, contact notification): saved only when
 * it is a same-domain mailbox, applied only inside ideatoapps_with_sender(), never shown on the site. Mail is captured with
 * pre_wp_mail (which runs before the From filters, so the capture applies them itself, as wp_mail would).
 */
final class MailSenderTest extends SeoTestCase {
	private const EMAIL = 'admin@ideatoapps.net';

	/** @var array<int, array<string, mixed>> */
	private array $mails = array();
	/** @var callable */
	private $capture;
	/** @var callable */
	private $home;

	protected function setUp(): void {
		parent::setUp();
		require_once ABSPATH . WPINC . '/PHPMailer/PHPMailer.php';
		$_SERVER['REMOTE_ADDR'] = '203.0.113.' . wp_rand( 1, 250 );
		$this->mails            = array();
		$this->capture          = function ( $short, $atts ) {
			$pm = new PHPMailer\PHPMailer\PHPMailer( true );
			do_action_ref_array( 'phpmailer_init', array( &$pm ) );
			$this->mails[] = $atts + array(
				'from'   => apply_filters( 'wp_mail_from', 'wordpress@default.test' ),
				'name'   => apply_filters( 'wp_mail_from_name', 'WordPress' ),
				'sender' => $pm->Sender,
			);
			return true;
		};
		add_filter( 'pre_wp_mail', $this->capture, 10, 2 );
		$this->home = static fn() => 'https://www.ideatoapps.net';
	}

	protected function tearDown(): void {
		remove_filter( 'pre_wp_mail', $this->capture, 10 );
		remove_filter( 'pre_option_home', $this->home );
		foreach ( array( 'ideatoapps_mail_from_email', 'ideatoapps_mail_from_name', 'ideatoapps_contact_enabled', 'ideatoapps_newsletter_enabled' ) as $o ) {
			delete_option( $o );
		}
		unset( $_SERVER['REMOTE_ADDR'] );
		parent::tearDown();
	}

	private function site( string $url = 'https://www.ideatoapps.net' ): void {
		remove_filter( 'pre_option_home', $this->home );
		$this->home = static fn() => $url;
		add_filter( 'pre_option_home', $this->home );
	}

	private function configure( string $email = self::EMAIL, string $name = 'IdeaToApps' ): void {
		$this->site();
		update_option( 'ideatoapps_mail_from_email', $email, false );
		update_option( 'ideatoapps_mail_from_name', $name, false );
	}

	private function save( array $fields ): array {
		wp_set_current_user( self::make_user( 'administrator' ) );
		return ideatoapps_process_settings( $fields + array( '_wpnonce' => wp_create_nonce( 'ideatoapps_save_settings' ) ) );
	}

	private function subscriber( string $email = 'ann@example.com' ): int {
		return (int) wp_insert_post( array( 'post_type' => 'ita_subscriber', 'post_status' => 'private', 'post_title' => $email, 'meta_input' => array( 'email' => $email, 'consent_at' => gmdate( 'c' ), 'status' => 'confirmed' ) ) );
	}

	public function test_defaults_are_empty_and_not_autoloaded(): void {
		$this->assertSame( '', get_option( 'ideatoapps_mail_from_email' ) );
		$this->assertSame( '', get_option( 'ideatoapps_mail_from_name' ) );
		$this->site();
		$this->save( array( 'mail_from_email' => self::EMAIL, 'mail_from_name' => 'IdeaToApps' ) );
		wp_cache_flush();
		$this->assertArrayNotHasKey( 'ideatoapps_mail_from_email', wp_load_alloptions() );
		$this->assertArrayNotHasKey( 'ideatoapps_mail_from_name', wp_load_alloptions() );
	}

	public function test_valid_same_domain_address_and_name_are_saved(): void {
		$this->site();
		$result = $this->save( array( 'mail_from_email' => '  Admin@IdeaToApps.net ', 'mail_from_name' => ' IdeaToApps  Support ' ) );
		$this->assertSame( array(), $result['errors'] );
		$this->assertSame( 'Admin@IdeaToApps.net', get_option( 'ideatoapps_mail_from_email' ) );
		$this->assertSame( 'IdeaToApps Support', get_option( 'ideatoapps_mail_from_name' ) );
	}

	/** @return array<string, array{0:string, 1:string, 2:bool}> site URL, address, accepted */
	public static function domains(): array {
		return array(
			'www host, apex address'      => array( 'https://www.ideatoapps.net', 'admin@ideatoapps.net', true ),
			'apex host, apex address'     => array( 'https://ideatoapps.net', 'admin@ideatoapps.net', true ),
			'apex host, www address'      => array( 'https://ideatoapps.net', 'admin@www.ideatoapps.net', true ),
			'subdomain host, parent'      => array( 'https://shop.ideatoapps.net', 'admin@ideatoapps.net', true ),
			'other domain'                => array( 'https://www.ideatoapps.net', 'admin@gmail.com', false ),
			'look-alike suffix'           => array( 'https://www.ideatoapps.net', 'admin@evilideatoapps.net', false ),
			'domain as prefix of another' => array( 'https://www.ideatoapps.net', 'admin@ideatoapps.net.evil.com', false ),
			'child of the site host'      => array( 'https://ideatoapps.net', 'admin@mail.ideatoapps.net', false ),
			'bare top-level domain'       => array( 'https://www.ideatoapps.net', 'admin@net', false ),
			'not an address'              => array( 'https://www.ideatoapps.net', 'admin.ideatoapps.net', false ),
		);
	}

	#[PHPUnit\Framework\Attributes\DataProvider( 'domains' )]
	public function test_domain_rule( string $site, string $address, bool $accepted ): void {
		$this->site( $site );
		update_option( 'ideatoapps_mail_from_email', 'old@ideatoapps.net', false );
		$result = $this->save( array( 'mail_from_email' => $address, 'mail_from_name' => '' ) );
		if ( $accepted ) {
			$this->assertSame( array(), $result['errors'], $address );
			$this->assertSame( $address, get_option( 'ideatoapps_mail_from_email' ) );
		} else {
			$this->assertSame( array( 'invalid_sender' ), array_keys( $result['errors'] ), $address );
			$this->assertNotSame( '', $result['errors']['invalid_sender'] );
			$this->assertSame( 'old@ideatoapps.net', get_option( 'ideatoapps_mail_from_email' ), 'old value kept' );
		}
	}

	public function test_a_refused_sender_keeps_both_old_values_and_everything_else_is_saved(): void {
		$this->configure( 'old@ideatoapps.net', 'Old name' );
		$result = $this->save( array( 'mail_from_email' => 'x@other.example', 'mail_from_name' => 'New name', 'contact_enabled' => '1' ) );
		$this->assertArrayHasKey( 'invalid_sender', $result['errors'] );
		$this->assertSame( 'old@ideatoapps.net', get_option( 'ideatoapps_mail_from_email' ) );
		$this->assertSame( 'Old name', get_option( 'ideatoapps_mail_from_name' ) );
		$this->assertTrue( ideatoapps_contact_enabled() );
	}

	public function test_line_breaks_brackets_commas_and_long_names_are_refused(): void {
		$this->configure( 'old@ideatoapps.net', 'Old name' );
		$bad = array(
			array( "admin@ideatoapps.net\r\nBcc: x@evil.example", 'Name' ),
			array( "admin@ideatoapps.net\nBcc: x@evil.example", 'Name' ),
			array( '<admin@ideatoapps.net>', 'Name' ),
			array( 'a@ideatoapps.net, b@ideatoapps.net', 'Name' ),
			array( self::EMAIL, "Name\r\nBcc: x@evil.example" ),
			array( self::EMAIL, "Name\nX: y" ),
			array( self::EMAIL, "Name\rX: y" ),
			array( self::EMAIL, 'Name <x@evil.example>' ),
			array( self::EMAIL, 'Name, Inc' ),
			array( self::EMAIL, str_repeat( 'a', 81 ) ),
		);
		foreach ( $bad as $i => $pair ) {
			$result = $this->save( array( 'mail_from_email' => $pair[0], 'mail_from_name' => $pair[1] ) );
			$this->assertArrayHasKey( 'invalid_sender', $result['errors'], "case {$i}" );
			$this->assertSame( 'old@ideatoapps.net', get_option( 'ideatoapps_mail_from_email' ), "case {$i}" );
			$this->assertSame( 'Old name', get_option( 'ideatoapps_mail_from_name' ), "case {$i}" );
		}
		$ok = $this->save( array( 'mail_from_email' => self::EMAIL, 'mail_from_name' => str_repeat( 'a', 80 ) ) );
		$this->assertSame( array(), $ok['errors'], '80 characters is allowed' );
	}

	public function test_other_writers_go_through_the_same_check(): void {
		$this->configure( 'old@ideatoapps.net', 'Old name' );
		update_option( 'ideatoapps_mail_from_email', 'evil@other.example', false );
		update_option( 'ideatoapps_mail_from_name', "Bad\r\nBcc: x@evil.example", false );
		$this->assertSame( 'old@ideatoapps.net', get_option( 'ideatoapps_mail_from_email' ) );
		$this->assertSame( 'Old name', get_option( 'ideatoapps_mail_from_name' ) );
	}

	public function test_empty_values_clear_the_settings_and_no_filters_are_added(): void {
		$this->configure();
		$result = $this->save( array( 'mail_from_email' => '', 'mail_from_name' => '' ) );
		$this->assertSame( array(), $result['errors'] );
		$this->assertSame( '', get_option( 'ideatoapps_mail_from_email' ) );
		$seen = null;
		ideatoapps_with_sender(
			function () use ( &$seen ) {
				$seen = array( has_filter( 'wp_mail_from' ), has_filter( 'wp_mail_from_name' ), empty( $GLOBALS['wp_filter']['phpmailer_init']->callbacks[99] ?? array() ) );
			}
		);
		$this->assertSame( array( false, false, true ), $seen );
	}

	public function test_filters_exist_only_inside_the_wrapper_and_return_its_result(): void {
		$this->configure();
		$this->assertFalse( has_filter( 'wp_mail_from' ) );
		$value  = ideatoapps_with_sender(
			static function () {
				return array(
					apply_filters( 'wp_mail_from', 'wordpress@default.test' ),
					apply_filters( 'wp_mail_from_name', 'WordPress' ),
					has_filter( 'wp_mail_from' ) && has_filter( 'wp_mail_from_name' ),
				);
			}
		);
		$this->assertSame( array( self::EMAIL, 'IdeaToApps', true ), $value );
		$this->assertFalse( has_filter( 'wp_mail_from' ) );
		$this->assertFalse( has_filter( 'wp_mail_from_name' ) );
		$this->assertEmpty( $GLOBALS['wp_filter']['phpmailer_init']->callbacks[99] ?? array() );
	}

	public function test_filters_are_removed_even_when_the_mail_call_throws(): void {
		$this->configure();
		$thrower = static function () {
			throw new RuntimeException( 'mailer exploded' );
		};
		add_filter( 'pre_wp_mail', $thrower, 5, 2 );
		$caught = false;
		try {
			ideatoapps_with_sender( static fn() => wp_mail( 'ann@example.com', 'S', 'B' ) );
		} catch ( RuntimeException $e ) {
			$caught = true;
		}
		remove_filter( 'pre_wp_mail', $thrower, 5 );
		$this->assertTrue( $caught, 'the exception still reaches the caller' );
		$this->assertFalse( has_filter( 'wp_mail_from' ), 'from removed' );
		$this->assertFalse( has_filter( 'wp_mail_from_name' ), 'name removed' );
		$this->assertEmpty( $GLOBALS['wp_filter']['phpmailer_init']->callbacks[99] ?? array(), 'sender hook removed' );
	}

	public function test_a_woocommerce_style_mail_outside_the_wrapper_is_untouched(): void {
		$this->configure();
		wp_mail( 'customer@example.com', 'Your order', 'Thanks' );
		ideatoapps_with_sender( static fn() => wp_mail( 'ann@example.com', 'Ours', 'Body' ) );
		wp_mail( 'customer@example.com', 'Your order 2', 'Thanks' );
		$this->assertCount( 3, $this->mails );
		foreach ( array( 0, 2 ) as $i ) {
			$this->assertSame( 'wordpress@default.test', $this->mails[ $i ]['from'] );
			$this->assertSame( 'WordPress', $this->mails[ $i ]['name'] );
			$this->assertSame( '', $this->mails[ $i ]['sender'] );
		}
		$this->assertSame( self::EMAIL, $this->mails[1]['from'] );
		$this->assertSame( 'IdeaToApps', $this->mails[1]['name'] );
		$this->assertSame( self::EMAIL, $this->mails[1]['sender'], 'return path' );
	}

	public function test_it_beats_other_plugins_filters_but_only_inside_the_wrapper(): void {
		$this->configure();
		$other = static fn() => 'shop@other.example';
		add_filter( 'wp_mail_from', $other );
		ideatoapps_with_sender( static fn() => wp_mail( 'ann@example.com', 'Ours', 'Body' ) );
		wp_mail( 'c@example.com', 'Theirs', 'Body' );
		remove_filter( 'wp_mail_from', $other );
		$this->assertSame( self::EMAIL, $this->mails[0]['from'] );
		$this->assertSame( 'shop@other.example', $this->mails[1]['from'] );
	}

	public function test_a_stored_address_that_no_longer_matches_the_site_is_ignored(): void {
		$this->configure();
		$this->site( 'https://www.example.org' );
		$this->assertSame( '', ideatoapps_mail_from_email() );
		ideatoapps_with_sender( static fn() => wp_mail( 'ann@example.com', 'Ours', 'Body' ) );
		$this->assertSame( 'wordpress@default.test', $this->mails[0]['from'] );
	}

	public function test_newsletter_confirmation_uses_the_sender(): void {
		$this->configure();
		$id = $this->subscriber();
		$this->assertTrue( ideatoapps_newsletter_send_confirmation( $id ) );
		$this->assertSame( array( self::EMAIL, 'IdeaToApps', self::EMAIL ), array( $this->mails[0]['from'], $this->mails[0]['name'], $this->mails[0]['sender'] ) );
		$this->assertFalse( has_filter( 'wp_mail_from' ) );
	}

	public function test_reading_link_uses_the_sender(): void {
		$this->configure();
		$GLOBALS['ideatoapps_reader_link_queue'] = array( $this->subscriber() => 0 );
		ideatoapps_reader_link_flush_queue();
		$this->assertCount( 1, $this->mails );
		$this->assertSame( array( self::EMAIL, 'IdeaToApps', self::EMAIL ), array( $this->mails[0]['from'], $this->mails[0]['name'], $this->mails[0]['sender'] ) );
		$this->assertFalse( has_filter( 'wp_mail_from' ) );
	}

	public function test_contact_notification_uses_the_sender_and_keeps_reply_to(): void {
		$this->configure();
		update_option( 'ideatoapps_contact_enabled', true );
		$req = new WP_REST_Request( 'POST', '/ideatoapps/v1/contact' );
		$req->set_header( 'Content-Type', 'application/json' );
		$req->set_header( 'X-WP-Nonce', wp_create_nonce( 'wp_rest' ) );
		$req->set_body( wp_json_encode( array( 'name' => 'Ann', 'email' => 'ann@example.com', 'message' => 'Hello there', 'website' => '' ) ) );
		$res = rest_do_request( $req );
		$this->assertSame( 200, $res->get_status() );
		$this->assertCount( 1, $this->mails );
		$this->assertSame( array( self::EMAIL, 'IdeaToApps', self::EMAIL ), array( $this->mails[0]['from'], $this->mails[0]['name'], $this->mails[0]['sender'] ) );
		$this->assertContains( 'Reply-To: ann@example.com', (array) $this->mails[0]['headers'] );
		$this->assertStringNotContainsString( self::EMAIL, wp_json_encode( $res->get_data() ), 'not in the REST answer' );
	}

	public function test_without_the_options_all_three_mails_use_the_wordpress_default(): void {
		$this->site();
		update_option( 'ideatoapps_contact_enabled', true );
		ideatoapps_newsletter_send_confirmation( $this->subscriber() );
		$GLOBALS['ideatoapps_reader_link_queue'] = array( $this->subscriber( 'bob@example.com' ) => 0 );
		ideatoapps_reader_link_flush_queue();
		$this->assertCount( 2, $this->mails );
		foreach ( $this->mails as $m ) {
			$this->assertSame( array( 'wordpress@default.test', 'WordPress', '' ), array( $m['from'], $m['name'], $m['sender'] ) );
		}
	}

	public function test_the_address_is_never_printed_on_the_front_end_or_in_rest_answers(): void {
		$this->configure( self::EMAIL, 'Zed Sender Name' );
		update_option( 'ideatoapps_contact_enabled', true );
		update_option( 'ideatoapps_newsletter_enabled', true );
		$pages = array( home_url( '/' ) );
		foreach ( array( 'contact' => 'Contact', 'blog' => 'Blog', 'newsletter' => 'Newsletter' ) as $slug => $title ) {
			$pages[] = (string) get_permalink( $this->make_page( $slug, $title ) );
		}
		wp_set_current_user( 0 );
		foreach ( $pages as $url ) {
			$this->go_to( $url );
			ob_start();
			wp_head();
			while ( have_posts() ) {
				the_post();
				echo apply_filters( 'the_content', get_the_content() ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			}
			ideatoapps_part( 'footer-links' );
			wp_footer();
			$html = (string) ob_get_clean();
			$this->assertNotSame( '', trim( $html ), $url );
			$this->assertStringNotContainsString( self::EMAIL, $html, $url );
			$this->assertStringNotContainsString( 'Zed Sender Name', $html, $url );
		}
		foreach ( array( '/', '/wp/v2/pages', '/wp/v2/posts', '/wp/v2/settings', '/ideatoapps/v1' ) as $route ) {
			$json = wp_json_encode( rest_do_request( new WP_REST_Request( 'GET', $route ) )->get_data() );
			$this->assertStringNotContainsString( self::EMAIL, (string) $json, $route );
			$this->assertStringNotContainsString( 'ideatoapps_mail_from', (string) $json, $route );
		}
		wp_set_current_user( self::make_user( 'administrator' ) );
		$json = wp_json_encode( rest_do_request( new WP_REST_Request( 'GET', '/wp/v2/settings' ) )->get_data() );
		$this->assertStringNotContainsString( self::EMAIL, (string) $json, 'not even in the settings REST route for an admin' );
	}

	public function test_settings_page_shows_the_section_help_and_escapes_the_stored_values(): void {
		$this->configure( self::EMAIL, 'A "quoted" name' );
		wp_set_current_user( self::make_user( 'administrator' ) );
		ob_start();
		ideatoapps_render_settings_page();
		$html = (string) ob_get_clean();
		$this->assertStringContainsString( 'Sender for site emails', $html );
		$this->assertStringContainsString( 'name="mail_from_email"', $html );
		$this->assertStringContainsString( 'name="mail_from_name"', $html );
		$this->assertStringContainsString( 'value="' . self::EMAIL . '"', $html );
		$this->assertStringContainsString( 'A &quot;quoted&quot; name', $html );
		$this->assertStringNotContainsString( 'A "quoted" name', $html );
		foreach ( array( 'WooCommerce', 'Email Deliverability', 'SPF', 'DKIM', 'never shown', 'WordPress default' ) as $needle ) {
			$this->assertStringContainsString( $needle, $html, $needle );
		}
	}
}
