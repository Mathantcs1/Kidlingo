<?php
/** Shared helpers for the WordPress-aware PHPUnit bootstrap. */

function ideatoapps_tests_prepare( string $site ): void {
	$core = $site . '/.wp/wordpress';
	if ( ! file_exists( $core . '/wp-load.php' ) || ! file_exists( $core . '/wp-content/plugins/woocommerce/woocommerce.php' ) ) {
		fwrite( STDERR, "WordPress/WooCommerce not found in .wp/. Run: npm run wp:bootstrap\n" );
		exit( 1 );
	}
	$content = $site . '/.wp/test-content';
	if ( getenv( 'IDEATOAPPS_TESTS_CHILD' ) ) {
		return;
	}
	// Fresh DB each run.
	$db = $content . '/database';
	if ( is_dir( $db ) ) {
		foreach ( glob( $db . '/{,.}*', GLOB_BRACE ) as $f ) {
			if ( is_file( $f ) ) {
				unlink( $f );
			}
		}
	}
	foreach ( array( $content, $db, $content . '/plugins', $content . '/themes', $content . '/uploads' ) as $d ) {
		is_dir( $d ) || mkdir( $d, 0777, true );
	}
	// SQLite drop-in from the Playground CLI package (no network needed).
	$sqlite = $site . '/.wp/sqlite/sqlite-database-integration';
	if ( ! file_exists( $sqlite . '/load.php' ) ) {
		$zip = new ZipArchive();
		$zip->open( $site . '/node_modules/@wp-playground/cli/sqlite-database-integration.zip' );
		$zip->extractTo( $site . '/.wp/sqlite-tmp' );
		$zip->close();
		is_dir( $site . '/.wp/sqlite' ) || mkdir( $site . '/.wp/sqlite', 0777, true );
		rename( $site . '/.wp/sqlite-tmp/plugin-sqlite-database-integration', $sqlite );
		rmdir( $site . '/.wp/sqlite-tmp' );
	}
	$dropin = file_get_contents( $sqlite . '/db.copy' );
	$dropin = str_replace( array( '{SQLITE_IMPLEMENTATION_FOLDER_PATH}', '{SQLITE_PLUGIN}' ), array( $sqlite, 'sqlite-database-integration/load.php' ), $dropin );
	file_put_contents( $content . '/db.php', $dropin );
	// Mount plugins/theme under the test content dir.
	$links = array(
		$content . '/plugins/woocommerce'      => $core . '/wp-content/plugins/woocommerce',
		$content . '/plugins/ideatoapps-core'  => $site . '/wp-content/plugins/ideatoapps-core',
		$content . '/themes/ideatoapps'        => $site . '/wp-content/themes/ideatoapps',
	);
	foreach ( $links as $link => $target ) {
		if ( ! is_link( $link ) ) {
			symlink( $target, $link );
		}
	}
}

function ideatoapps_tests_define( string $site ): void {
	$defs = array(
		'ABSPATH'            => $site . '/.wp/wordpress/',
		'WP_CONTENT_DIR'     => $site . '/.wp/test-content',
		'DB_DIR'             => $site . '/.wp/test-content/database/',
		'DB_FILE'            => 'test.sqlite',
		'DB_NAME'            => 'wordpress_test',
		'DB_USER'            => '',
		'DB_PASSWORD'        => '',
		'DB_HOST'            => 'localhost',
		'DB_CHARSET'         => 'utf8mb4',
		'DB_COLLATE'         => '',
		'WP_DEBUG'           => false,
		'WP_TESTS_DOMAIN'    => 'example.org',
		'WP_DEFAULT_THEME'   => 'ideatoapps',
		'DISABLE_WP_CRON'    => true,
		'WP_HTTP_BLOCK_EXTERNAL' => true,
		'AUTH_KEY' => 'k', 'SECURE_AUTH_KEY' => 'k', 'LOGGED_IN_KEY' => 'k', 'NONCE_KEY' => 'k',
		'AUTH_SALT' => 's', 'SECURE_AUTH_SALT' => 's', 'LOGGED_IN_SALT' => 's', 'NONCE_SALT' => 's',
	);
	foreach ( $defs as $name => $value ) {
		defined( $name ) || define( $name, $value );
	}
	$GLOBALS['table_prefix'] = 'wp_';
	$_SERVER['HTTP_HOST']    = 'example.org';
	$_SERVER['SERVER_NAME']  = 'example.org';
	$_SERVER['REQUEST_URI']  = '/';

	// Activate plugins/theme without needing them in the DB options.
	require_once $site . '/.wp/wordpress/wp-includes/plugin.php';
	add_filter( 'pre_option_active_plugins', fn() => array( 'woocommerce/woocommerce.php', 'ideatoapps-core/ideatoapps-core.php' ) );
	add_filter( 'pre_wp_mail', '__return_true' );
	add_filter( 'pre_option_template', fn() => 'ideatoapps' );
	add_filter( 'pre_option_stylesheet', fn() => 'ideatoapps' );
	add_action( 'init', function () {
		if ( class_exists( 'WC_Install' ) && ! get_option( 'ideatoapps_tests_wc_installed' ) ) {
			WC_Install::install();
			update_option( 'ideatoapps_tests_wc_installed', 1 );
		}
	}, 0 );
}
