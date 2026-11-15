<?php
final class RateLimitTest extends WPTestCase {
	protected function setUp(): void {
		parent::setUp();
		$_SERVER['REMOTE_ADDR'] = '203.0.113.' . wp_rand( 1, 250 );
	}

	protected function tearDown(): void {
		unset( $_SERVER['REMOTE_ADDR'] );
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

	public function test_client_ip_uses_remote_addr_only_and_a_validated_filter(): void {
		$_SERVER['HTTP_X_FORWARDED_FOR'] = '9.9.9.9';
		$this->assertSame( $_SERVER['REMOTE_ADDR'], ideatoapps_client_ip() );
		add_filter( 'ideatoapps_client_ip', static fn() => 'not-an-ip' );
		$this->assertSame( '0.0.0.0', ideatoapps_client_ip() );
		unset( $_SERVER['HTTP_X_FORWARDED_FOR'] );
		remove_all_filters( 'ideatoapps_client_ip' );
	}
}
