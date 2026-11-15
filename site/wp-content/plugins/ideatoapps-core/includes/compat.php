<?php
/**
 * PHP 8.0 compatibility helpers (the plugin header says Requires PHP 8.0).
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Whether an array is a list (keys 0..n-1 in order). Same result as PHP 8.1's native list check, which PHP 8.0 lacks.
 *
 * @param array $value Array to test.
 * @return bool
 */
function ideatoapps_is_list( array $value ) {
	$next = 0;
	foreach ( $value as $key => $unused ) {
		if ( $key !== $next++ ) {
			return false;
		}
	}
	return true;
}
