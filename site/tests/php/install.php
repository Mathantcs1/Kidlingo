<?php
/** Child process: creates the WordPress tables in the fresh test database. */
$site = dirname( __DIR__, 2 );
require_once __DIR__ . '/env.php';
ideatoapps_tests_define( $site );
define( 'WP_INSTALLING', true );
require_once ABSPATH . 'wp-settings.php';
require_once ABSPATH . 'wp-admin/includes/upgrade.php';
wp_install( 'IdeaToApps Tests', 'admin', 'admin@example.org', true, '', 'password' );
echo "WordPress test database installed\n";
