<?php
/**
 * Registered, sanitised post meta for the `app` post type.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Permission check shared by all app meta: the user must be able to edit that post.
 *
 * @param bool   $allowed  Unused.
 * @param string $meta_key Unused.
 * @param int    $post_id  Post ID.
 * @param int    $user_id  User ID.
 * @return bool
 */
function ideatoapps_meta_auth( $allowed, $meta_key, $post_id, $user_id ) {
	return user_can( $user_id, 'edit_post', $post_id );
}

/**
 * Sanitise a URL; only http(s) is accepted, anything else becomes an empty string.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function ideatoapps_sanitize_http_url( $value ) {
	return esc_url_raw( (string) $value, array( 'http', 'https' ) );
}

/**
 * Only the known delivery statuses are accepted.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function ideatoapps_sanitize_delivery_status( $value ) {
	return in_array( $value, array( 'draft', 'coming_soon', 'live' ), true ) ? $value : 'draft';
}

/**
 * Decode a JSON list, or return an empty array for invalid JSON or a non-list.
 *
 * @param mixed $value JSON string (or already-decoded array).
 * @return array
 */
function ideatoapps_decode_list( $value ) {
	$data = is_array( $value ) ? $value : json_decode( is_string( $value ) ? $value : '', true );
	return ( is_array( $data ) && array_is_list( $data ) ) ? $data : array();
}

/**
 * FAQ: JSON list of {q, a} objects; malformed entries are dropped.
 *
 * @param mixed $value Raw value.
 * @return string JSON.
 */
function ideatoapps_sanitize_faq( $value ) {
	$out = array();
	foreach ( ideatoapps_decode_list( $value ) as $row ) {
		if ( is_array( $row ) && isset( $row['q'], $row['a'] ) && is_string( $row['q'] ) && is_string( $row['a'] ) ) {
			$out[] = array(
				'q' => sanitize_text_field( $row['q'] ),
				'a' => sanitize_textarea_field( $row['a'] ),
			);
		}
	}
	return wp_json_encode( $out );
}

/**
 * Features: JSON list of strings; non-strings are dropped.
 *
 * @param mixed $value Raw value.
 * @return string JSON.
 */
function ideatoapps_sanitize_features( $value ) {
	$out = array();
	foreach ( ideatoapps_decode_list( $value ) as $row ) {
		if ( is_string( $row ) ) {
			$out[] = sanitize_text_field( $row );
		}
	}
	return wp_json_encode( $out );
}

/**
 * Register all app meta keys.
 */
function ideatoapps_register_app_meta() {
	$common = array(
		'single'         => true,
		'show_in_rest'   => true,
		'auth_callback'  => 'ideatoapps_meta_auth',
	);
	$fields = array(
		'tagline'         => array( 'string', 'sanitize_text_field', '' ),
		'platforms'       => array( 'string', 'sanitize_text_field', '' ),
		'price_label'     => array( 'string', 'sanitize_text_field', '' ),
		'launch_url'      => array( 'string', 'ideatoapps_sanitize_http_url', '' ),
		'demo_url'        => array( 'string', 'ideatoapps_sanitize_http_url', '' ),
		'video_id'        => array( 'string', 'sanitize_text_field', '' ),
		'faq'             => array( 'string', 'ideatoapps_sanitize_faq', '[]' ),
		'features'        => array( 'string', 'ideatoapps_sanitize_features', '[]' ),
		'delivery_status' => array( 'string', 'ideatoapps_sanitize_delivery_status', 'draft' ),
		'woo_product_id'  => array( 'integer', 'absint', 0 ),
	);
	foreach ( $fields as $key => $def ) {
		register_post_meta(
			'app',
			$key,
			$common + array(
				'type'              => $def[0],
				'sanitize_callback' => $def[1],
				'default'           => $def[2],
			)
		);
	}
}
add_action( 'init', 'ideatoapps_register_app_meta' );
