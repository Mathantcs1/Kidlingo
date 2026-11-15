<?php
/**
 * One-time admin notices per user and post (stored in a short-lived transient).
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Transient key for the current user and a post.
 *
 * @param int $post_id Post ID.
 * @return string
 */
function ideatoapps_notice_key( $post_id ) {
	return 'ita_notices_' . get_current_user_id() . '_' . (int) $post_id;
}

/**
 * Queue a notice for the next admin page load of this post.
 *
 * @param int    $post_id Post ID.
 * @param string $message Plain-text message.
 */
function ideatoapps_add_notice( $post_id, $message ) {
	$notices   = get_transient( ideatoapps_notice_key( $post_id ) );
	$notices   = is_array( $notices ) ? $notices : array();
	$notices[] = (string) $message;
	set_transient( ideatoapps_notice_key( $post_id ), $notices, 5 * MINUTE_IN_SECONDS );
}

/**
 * Return and delete queued notices (so each is shown once).
 *
 * @param int $post_id Post ID.
 * @return string[]
 */
function ideatoapps_pull_notices( $post_id ) {
	$notices = get_transient( ideatoapps_notice_key( $post_id ) );
	delete_transient( ideatoapps_notice_key( $post_id ) );
	return is_array( $notices ) ? $notices : array();
}

/**
 * Print queued notices on the app and video edit screens.
 */
function ideatoapps_print_notices() {
	$screen = get_current_screen();
	$post   = get_post();
	if ( ! $screen || ! in_array( $screen->post_type, array( 'app', 'video' ), true ) || ! $post ) {
		return;
	}
	foreach ( ideatoapps_pull_notices( $post->ID ) as $message ) {
		printf( '<div class="notice notice-warning is-dismissible"><p>%s</p></div>', esc_html( $message ) );
	}
}
add_action( 'admin_notices', 'ideatoapps_print_notices' );
