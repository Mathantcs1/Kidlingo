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
	ideatoapps_register_video_post_type();
	update_option( 'ideatoapps_rewrite_version', IDEATOAPPS_CORE_VERSION, false );
	flush_rewrite_rules( false );
}

/**
 * Replacing the plugin files does not run activation, so flush once when the stored version differs
 * (this is how /learn/ starts resolving on a site that already had the plugin active).
 */
function ideatoapps_core_maybe_flush_rewrites() {
	if ( IDEATOAPPS_CORE_VERSION !== get_option( 'ideatoapps_rewrite_version' ) ) {
		update_option( 'ideatoapps_rewrite_version', IDEATOAPPS_CORE_VERSION, false );
		flush_rewrite_rules( false );
	}
}
add_action( 'init', 'ideatoapps_core_maybe_flush_rewrites', 99 );

/**
 * Drop the app URLs from the rewrite rules.
 */
function ideatoapps_core_deactivate() {
	unregister_post_type( 'app' );
	unregister_taxonomy( 'app_category' );
	unregister_post_type( 'video' );
	delete_option( 'ideatoapps_rewrite_version' );
	flush_rewrite_rules( false );
}
