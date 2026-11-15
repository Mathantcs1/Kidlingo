<?php
/**
 * Media picker visibility for protected release zips.
 *
 * Release zips are made private at upload (see download-files.php). WordPress lists private attachments in the media
 * modal only for users with read_private_posts, so an author who uploaded a zip would not find it again when they
 * reopen the version picker. WP_Query adds the "own posts only" condition itself for every private status that is asked
 * for with perm=readable when the user cannot read them, so asking for 'private' with that flag shows an author their
 * OWN private files and nobody else's. Nothing becomes public: anonymous visitors and REST media listings are untouched.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Add the private status to the media modal query for users who could not otherwise see their own private uploads.
 *
 * @param array $query Query args from wp_ajax_query_attachments().
 * @return array
 */
function ideatoapps_media_modal_include_own_private( $query ) {
	if ( ! is_user_logged_in() || current_user_can( 'read_private_posts' ) || ! is_array( $query ) ) {
		return $query;
	}
	$status = isset( $query['post_status'] ) ? $query['post_status'] : 'inherit';
	$list   = is_array( $status ) ? $status : array_map( 'trim', explode( ',', (string) $status ) );
	if ( ! in_array( 'private', $list, true ) ) {
		$list[] = 'private';
	}
	$query['post_status'] = implode( ',', $list );
	$query['perm']        = 'readable'; // WP_Query then limits private posts to the user's own.
	return $query;
}
add_filter( 'ajax_query_attachments_args', 'ideatoapps_media_modal_include_own_private' );
