<?php
final class RateLimitTest extends WPTestCase {
	protected function setUp(): void {
		parent::setUp();
		$_SERVER['REMOTE_ADDR']    = '203.0.113.' . wp_rand( 1, 250 );
		$_SERVER['REQUEST_METHOD'] = 'GET';
	}

	protected function tearDown(): void {
		unset( $_SERVER['REMOTE_ADDR'], $_SERVER['REQUEST_METHOD'] );
		parent::tearDown();
	}

	/** Make every cached copy of the counter rows stale, as a parallel request that has not seen the last write would. */
	private function poison_cached_counters(): void {
		global $wpdb;
		$names = $wpdb->get_col( "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'ita\\_rl\\_%'" ); // phpcs:ignore WordPress.DB
		foreach ( $names as $name ) {
			wp_cache_set( $name, '0', 'options' );
			wp_cache_set( '_transient_' . $name, array( 'count' => 0, 'start' => time() ), 'options' );
		}
	}

	public function test_claims_count_exactly_even_when_cached_reads_are_stale(): void {
		$counts = array();
		for ( $i = 1; $i <= 8; $i++ ) {
			$counts[] = ideatoapps_rate_limit_claim( 'newsletter', 1000 );
			$this->poison_cached_counters();
		}
		$this->assertSame( array( 1, 2, 3, 4, 5, 6, 7, 8 ), $counts );
	}

	public function test_sixth_claim_is_refused_and_buckets_windows_and_ips_are_independent(): void {
		$refused = array();
		for ( $i = 1; $i <= 6; $i++ ) {
			$refused[] = ideatoapps_rate_limit_exceeded( 'newsletter' );
			$this->poison_cached_counters();
		}
		$this->assertSame( array( false, false, false, false, false, true ), $refused );
		$this->assertSame( 1, ideatoapps_rate_limit_claim( 'contact', 1000 ), 'other bucket' );
		$this->assertSame( 1, ideatoapps_rate_limit_claim( 'newsletter', 1001 ), 'next window' );
		$_SERVER['REMOTE_ADDR'] = '198.51.100.9';
		$this->assertSame( 1, ideatoapps_rate_limit_claim( 'newsletter', 1000 ), 'other IP' );
	}

	public function test_expired_windows_are_cleaned_up(): void {
		global $wpdb;
		ideatoapps_rate_limit_claim( 'newsletter', 1 );
		ideatoapps_rate_limit_purge( 500 );
		$left = $wpdb->get_col( "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'ita\\_rl\\_%'" ); // phpcs:ignore WordPress.DB
		$this->assertSame( array(), $left );
	}

	public function test_nonce_refresh_route_returns_a_usable_nonce_with_no_store_headers(): void {
		$this->assertArrayHasKey( '/ideatoapps/v1/nonce', rest_get_server()->get_routes() );
		$res = rest_do_request( new WP_REST_Request( 'GET', '/ideatoapps/v1/nonce' ) );
		$this->assertSame( 200, $res->get_status() );
		$nonce = $res->get_data()['nonce'] ?? '';
		$this->assertMatchesRegularExpression( '/^[a-f0-9]{10}$/', $nonce );
		$this->assertSame( 1, wp_verify_nonce( $nonce, 'wp_rest' ) );
		$cc = $res->get_headers()['Cache-Control'] ?? '';
		$this->assertStringContainsString( 'no-store', $cc );
		$this->assertStringContainsString( 'private', $cc );
		$this->assertSame( 'no-cache', $res->get_headers()['Pragma'] ?? '' );
	}

	/** Call the nonce route with a login cookie for a real user; returns [route nonce, user nonce, anonymous nonce]. */
	private function nonce_with_cookie( array $headers, array $params = array() ): array {
		$uid    = self::make_user( 'subscriber' );
		$cookie = wp_generate_auth_cookie( $uid, time() + 3600, 'logged_in' );
		$_COOKIE[ LOGGED_IN_COOKIE ] = $cookie;
		wp_set_current_user( $uid );
		$user = wp_create_nonce( 'wp_rest' );
		wp_set_current_user( 0 );
		$anon = wp_create_nonce( 'wp_rest' );
		$req  = new WP_REST_Request( 'GET', '/ideatoapps/v1/nonce' );
		foreach ( $headers as $k => $v ) {
			$req->set_header( $k, $v );
		}
		foreach ( $params as $k => $v ) {
			$req->set_param( $k, $v );
		}
		$got = rest_do_request( $req )->get_data()['nonce'];
		unset( $_COOKIE[ LOGGED_IN_COOKIE ] );
		wp_set_current_user( 0 );
		$this->assertNotSame( $user, $anon, 'precondition: user and anonymous nonces differ' );
		return array( $got, $user, $anon );
	}

	public function test_nonce_route_gives_a_foreign_origin_only_the_anonymous_nonce(): void {
		list( $got, , $anon ) = $this->nonce_with_cookie( array( 'Origin' => 'https://evil.example' ) );
		$this->assertSame( $anon, $got );
		list( $got, , $anon ) = $this->nonce_with_cookie( array( 'Origin' => 'null' ) );
		$this->assertSame( $anon, $got, 'opaque origin' );
		list( $got, , $anon ) = $this->nonce_with_cookie( array( 'Origin' => 'https://' . wp_parse_url( home_url(), PHP_URL_HOST ) . '.evil.example' ) );
		$this->assertSame( $anon, $got, 'look-alike host' );
	}

	public function test_nonce_route_gives_same_origin_and_origin_less_requests_the_user_nonce(): void {
		list( $got, $user ) = $this->nonce_with_cookie( array() );
		$this->assertSame( $user, $got, 'no Origin header' );
		list( $got, $user ) = $this->nonce_with_cookie( array( 'Origin' => home_url() ) );
		$this->assertSame( $user, $got, 'same Origin' );
	}

	#[\PHPUnit\Framework\Attributes\DataProvider( 'origin_cases' )]
	public function test_nonce_route_compares_the_full_origin( string $home, string $origin, bool $first_party ): void {
		add_filter( 'home_url', static fn() => $home, 99 );
		list( $got, $user, $anon ) = $this->nonce_with_cookie( array( 'Origin' => $origin ) );
		remove_all_filters( 'home_url', 99 );
		$this->assertSame( $first_party ? $user : $anon, $got, $home . ' vs ' . $origin );
	}

	public static function origin_cases(): array {
		return array(
			'same https'               => array( 'https://ideatoapps.net', 'https://ideatoapps.net', true ),
			'explicit default port'    => array( 'https://ideatoapps.net', 'https://ideatoapps.net:443', true ),
			'uppercase host'           => array( 'https://ideatoapps.net', 'https://IDEATOAPPS.NET', true ),
			'trailing dot'             => array( 'https://ideatoapps.net', 'https://ideatoapps.net.', true ),
			'http home, http origin'   => array( 'http://localhost:8888', 'http://localhost:8888', true ),
			'http origin, https home'  => array( 'https://ideatoapps.net', 'http://ideatoapps.net', false ),
			'https origin, http home'  => array( 'http://ideatoapps.net', 'https://ideatoapps.net', false ),
			'other port'               => array( 'https://ideatoapps.net', 'https://ideatoapps.net:2083', false ),
			'default vs other http'    => array( 'http://ideatoapps.net', 'http://ideatoapps.net:8080', false ),
			'null origin'              => array( 'https://ideatoapps.net', 'null', false ),
			'other host'               => array( 'https://ideatoapps.net', 'https://evil.example', false ),
		);
	}

	public function test_nonce_route_refuses_to_authenticate_jsonp_callers(): void {
		list( $got, , $anon ) = $this->nonce_with_cookie( array(), array( '_jsonp' => 'steal' ) );
		$this->assertSame( $anon, $got );
	}

	public function test_client_ip_uses_remote_addr_only_and_a_validated_filter(): void {
		$_SERVER['HTTP_X_FORWARDED_FOR'] = '9.9.9.9';
		$this->assertSame( $_SERVER['REMOTE_ADDR'], ideatoapps_client_ip() );
		add_filter( 'ideatoapps_client_ip', static fn() => 'not-an-ip' );
		$this->assertSame( '0.0.0.0', ideatoapps_client_ip() );
		unset( $_SERVER['HTTP_X_FORWARDED_FOR'] );
		remove_all_filters( 'ideatoapps_client_ip' );
	}
}
