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

	/** A throw-away user with the given role (rolled back with the test). */
	protected static function make_user( string $role ): int {
		return wp_insert_user( array( 'user_login' => 'u_' . $role . wp_generate_password( 6, false ), 'user_pass' => 'x', 'role' => $role ) );
	}

	/** Release zips the tests create (the DB rolls back, the filesystem does not): protected folder plus any .zip in uploads. */
	private static function remove_test_files(): void {
		$base = wp_upload_dir( null, false )['basedir'];
		foreach ( array( $base . '/woocommerce_uploads/ideatoapps' ) as $dir ) {
			if ( is_dir( $dir ) ) {
				foreach ( new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $dir, FilesystemIterator::SKIP_DOTS ), RecursiveIteratorIterator::CHILD_FIRST ) as $f ) {
					$f->isDir() ? rmdir( $f->getPathname() ) : unlink( $f->getPathname() );
				}
			}
		}
		foreach ( glob( $base . '/*/*/*.zip' ) ?: array() as $zip ) {
			unlink( $zip );
		}
	}

	protected function tearDown(): void {
		global $wpdb;
		$wpdb->query( 'ROLLBACK' );
		wp_cache_flush();
		self::remove_test_files();
		if ( function_exists( 'WC' ) && WC()->cart ) {
			WC()->cart->empty_cart();
		}
		wp_set_current_user( 0 );
		parent::tearDown();
	}
}
