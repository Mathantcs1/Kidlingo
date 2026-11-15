<?php
/**
 * Activation and deactivation: make /apps/ URLs work (or stop) by flushing rewrite rules.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Register the post type, then flush so /apps/ and /apps/{slug}/ resolve.
 */
function ideatoapps_core_activate() {
	ideatoapps_register_app_post_type();
	flush_rewrite_rules( false );
}

/**
 * Drop the app URLs from the rewrite rules.
 */
function ideatoapps_core_deactivate() {
	unregister_post_type( 'app' );
	unregister_taxonomy( 'app_category' );
	flush_rewrite_rules( false );
}
