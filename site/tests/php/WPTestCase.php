<?php
use PHPUnit\Framework\TestCase;

/**
 * Base class for WordPress-aware tests. Each test runs inside a DB transaction that is rolled back,
 * and caches/globals are reset, so tests never leak posts, options, orders or users into each other.
 */
abstract class WPTestCase extends TestCase {
	protected function setUp(): void {
		parent::setUp();
		global $wpdb;
		$wpdb->query( 'START TRANSACTION' );
		wp_cache_flush();
	}

	protected function tearDown(): void {
		global $wpdb;
		$wpdb->query( 'ROLLBACK' );
		wp_cache_flush();
		if ( function_exists( 'WC' ) && WC()->cart ) {
			WC()->cart->empty_cart();
		}
		wp_set_current_user( 0 );
		parent::tearDown();
	}
}
