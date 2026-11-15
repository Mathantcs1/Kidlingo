<?php
// Plain PHPUnit bootstrap (no WordPress loaded). Pure-PHP logic classes are tested here;
// browser-level behaviour is covered by Playwright (npm run test:e2e).
require_once dirname( __DIR__, 2 ) . '/vendor/autoload.php';

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__, 2 ) . '/.wp/wordpress/' );
}
