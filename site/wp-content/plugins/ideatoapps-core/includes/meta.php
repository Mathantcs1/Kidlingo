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
 * woo_product_id picks the product the buy button sells, so only administrators may change it (UI, save handler and REST).
 *
 * @param bool   $allowed  Unused.
 * @param string $meta_key Unused.
 * @param int    $post_id  Unused.
 * @param int    $user_id  User ID.
 * @return bool
 */
function ideatoapps_meta_auth_admin( $allowed, $meta_key, $post_id, $user_id ) {
	return user_can( $user_id, 'manage_options' );
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
	return ( is_array( $data ) && ideatoapps_is_list( $data ) ) ? $data : array();
}

/**
 * Encode a list the way it is stored (readable unicode, unescaped slashes).
 *
 * @param array $list List.
 * @return string
 */
function ideatoapps_encode_list( array $list ) {
	return wp_json_encode( array_values( $list ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
}

/**
 * Remember whether the last sanitised value for a JSON meta key was invalid input.
 * The sanitise callback cannot see the old value, so the update filter below uses this flag.
 *
 * @param string    $key  Meta key.
 * @param bool|null $set  New state, or null to only read.
 * @return bool
 */
function ideatoapps_json_invalid_flag( $key, $set = null ) {
	static $flags = array();
	if ( null !== $set ) {
		$flags[ $key ] = $set;
	}
	return ! empty( $flags[ $key ] );
}

/**
 * Whether a raw JSON meta value is acceptable (empty string clears the list).
 *
 * @param mixed $value Raw value.
 * @return bool
 */
function ideatoapps_json_list_valid( $value ) {
	if ( is_array( $value ) ) {
		return ideatoapps_is_list( $value );
	}
	if ( ! is_string( $value ) ) {
		return false;
	}
	if ( '' === trim( $value ) ) {
		return true;
	}
	$data = json_decode( $value, true );
	return is_array( $data ) && ideatoapps_is_list( $data );
}

/**
 * FAQ: JSON list of {q, a} objects; malformed entries are dropped.
 *
 * @param mixed $value Raw value.
 * @return string JSON.
 */
function ideatoapps_sanitize_faq( $value ) {
	ideatoapps_json_invalid_flag( 'faq', ! ideatoapps_json_list_valid( $value ) );
	$out = array();
	foreach ( ideatoapps_decode_list( $value ) as $row ) {
		if ( is_array( $row ) && isset( $row['q'], $row['a'] ) && is_string( $row['q'] ) && is_string( $row['a'] ) ) {
			$out[] = array(
				'q' => sanitize_text_field( $row['q'] ),
				'a' => sanitize_textarea_field( $row['a'] ),
			);
		}
	}
	return ideatoapps_encode_list( $out );
}

/**
 * Features: JSON list of strings; non-strings are dropped.
 *
 * @param mixed $value Raw value.
 * @return string JSON.
 */
function ideatoapps_sanitize_features( $value ) {
	ideatoapps_json_invalid_flag( 'features', ! ideatoapps_json_list_valid( $value ) );
	$out = array();
	foreach ( ideatoapps_decode_list( $value ) as $row ) {
		if ( is_string( $row ) ) {
			$out[] = sanitize_text_field( $row );
		}
	}
	return ideatoapps_encode_list( $out );
}

/**
 * Keep the previous FAQ/features when the new value was invalid JSON (runs right after sanitising).
 * Also tells the editor why nothing changed.
 *
 * @param mixed  $check     Short-circuit value (null to continue).
 * @param int    $object_id Post ID.
 * @param string $meta_key  Meta key.
 * @return mixed
 */
function ideatoapps_keep_previous_on_invalid_json( $check, $object_id, $meta_key ) {
	if ( in_array( $meta_key, array( 'faq', 'features' ), true ) && 'app' === get_post_type( $object_id ) && ideatoapps_json_invalid_flag( $meta_key ) ) {
		ideatoapps_json_invalid_flag( $meta_key, false );
		/* translators: %s: field name (faq or features). */
		ideatoapps_add_notice( (int) $object_id, sprintf( __( 'The %s value was not valid and was not saved; the previous value was kept.', 'ideatoapps-core' ), $meta_key ) );
		return false;
	}
	return $check;
}
add_filter( 'update_post_metadata', 'ideatoapps_keep_previous_on_invalid_json', 10, 3 );
add_filter( 'add_post_metadata', 'ideatoapps_keep_previous_on_invalid_json', 10, 3 );

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
			( 'woo_product_id' === $key ? array( 'auth_callback' => 'ideatoapps_meta_auth_admin' ) + $common : $common ) + array(
				'type'              => $def[0],
				'sanitize_callback' => $def[1],
				'default'           => $def[2],
			)
		);
	}
}
add_action( 'init', 'ideatoapps_register_app_meta' );
