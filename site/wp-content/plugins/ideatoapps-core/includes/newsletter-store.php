<?php
/**
 * Newsletter subscriber storage helpers: status, lookup, one-time migration of rows from the old single-step form.
 *
 * Statuses: pending (stored, unconfirmed), confirmed (clicked the link), unsubscribed. Anything else reads as pending.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

const IDEATOAPPS_NEWSLETTER_SCHEMA = 2;

/**
 * Whether sign-up is switched on (default: no).
 *
 * @return bool
 */
function ideatoapps_newsletter_enabled() {
	return rest_sanitize_boolean( get_option( 'ideatoapps_newsletter_enabled', false ) );
}

/**
 * Status of a subscriber. A missing or unknown value is pending, never confirmed.
 *
 * @param int $id Post ID.
 * @return string
 */
function ideatoapps_subscriber_status( $id ) {
	$status = get_post_meta( $id, 'status', true );
	return in_array( $status, array( 'confirmed', 'unsubscribed' ), true ) ? $status : 'pending';
}

/**
 * Post IDs of all stored rows for an email.
 *
 * @param string $email Email (any case).
 * @return int[]
 */
function ideatoapps_find_subscriber_ids( $email ) {
	return array_map(
		'intval',
		get_posts(
			array(
				'post_type'      => 'ita_subscriber',
				'post_status'    => 'any',
				'posts_per_page' => -1,
				'fields'         => 'ids',
				'no_found_rows'  => true,
				'meta_key'       => 'email', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- one lookup per request.
				'meta_value'     => strtolower( trim( (string) $email ) ), // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			)
		)
	);
}

/**
 * Find a stored subscriber by (lower-case) email.
 *
 * @param string $email Email.
 * @return int Post ID or 0.
 */
function ideatoapps_find_subscriber( $email ) {
	$ids = ideatoapps_find_subscriber_ids( $email );
	return $ids ? $ids[0] : 0;
}

/**
 * Rows from the old single-step form have no status: record them as pending (they never confirmed). Runs once.
 */
function ideatoapps_newsletter_migrate() {
	if ( (int) get_option( 'ideatoapps_newsletter_schema', 0 ) >= IDEATOAPPS_NEWSLETTER_SCHEMA ) {
		return;
	}
	$ids = get_posts(
		array(
			'post_type'      => 'ita_subscriber',
			'post_status'    => 'any',
			'posts_per_page' => -1,
			'fields'         => 'ids',
			'no_found_rows'  => true,
			'meta_query'     => array( array( 'key' => 'status', 'compare' => 'NOT EXISTS' ) ), // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- runs once.
		)
	);
	foreach ( $ids as $id ) {
		update_post_meta( $id, 'status', 'pending' );
	}
	update_option( 'ideatoapps_newsletter_schema', IDEATOAPPS_NEWSLETTER_SCHEMA, true );
}
add_action( 'init', 'ideatoapps_newsletter_migrate', 20 );

/**
 * Hard-delete subscriber rows (post and meta, no trash). Other post types are never touched.
 *
 * @param int[] $ids Post IDs.
 * @return int Number deleted.
 */
function ideatoapps_delete_subscribers( array $ids ) {
	$n = 0;
	foreach ( array_unique( array_map( 'intval', $ids ) ) as $id ) {
		if ( $id > 0 && 'ita_subscriber' === get_post_type( $id ) && wp_delete_post( $id, true ) ) {
			++$n;
		}
	}
	return $n;
}
