<?php
/**
 * PHPUnit bootstrap that boots real WordPress (from .wp/wordpress) on a throw-away SQLite database
 * with WooCommerce, the ideatoapps theme and the ideatoapps-core plugin loaded.
 *
 * Prerequisite: `npm run wp:bootstrap` (fetches WordPress core + WooCommerce into .wp/).
 * A fresh database is built on every run (.wp/test-content/database/); each test is isolated by
 * WPTestCase (transaction + rollback). It never touches the dev site database.
 */
$site = dirname( __DIR__, 2 );
require_once $site . '/vendor/autoload.php';
require_once __DIR__ . '/env.php';

ideatoapps_tests_prepare( $site );

if ( ! getenv( 'IDEATOAPPS_TESTS_CHILD' ) ) {
	// Phase 1: install WordPress in a child process (WP_INSTALLING is process-wide).
	$cmd = sprintf( 'IDEATOAPPS_TESTS_CHILD=1 %s %s', escapeshellarg( PHP_BINARY ), escapeshellarg( __DIR__ . '/install.php' ) );
	passthru( $cmd, $code );
	if ( 0 !== $code ) {
		fwrite( STDERR, "WordPress test install failed\n" );
		exit( 1 );
	}
}

// Phase 2: boot WordPress normally.
ideatoapps_tests_define( $site );
require_once ABSPATH . 'wp-settings.php';

require_once __DIR__ . '/WPTestCase.php';
