<?php
/**
 * The `video` post type (Watch & Learn) and its registered, sanitised meta.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Register the video post type. The Learn archive page itself is built separately.
 */
function ideatoapps_register_video_post_type() {
	register_post_type(
		'video',
		array(
			'labels'       => array(
				'name'          => __( 'Videos', 'ideatoapps-core' ),
				'singular_name' => __( 'Video', 'ideatoapps-core' ),
				'add_new_item'  => __( 'Add new video', 'ideatoapps-core' ),
				'edit_item'     => __( 'Edit video', 'ideatoapps-core' ),
			),
			'public'       => true,
			'has_archive'  => 'learn',
			'rewrite'      => array( 'slug' => 'learn' ),
			'show_in_rest' => true,
			'menu_icon'    => 'dashicons-video-alt3',
			'supports'     => array( 'title', 'editor', 'thumbnail', 'excerpt' ),
		)
	);
}
add_action( 'init', 'ideatoapps_register_video_post_type' );

/**
 * A YouTube video ID is exactly 11 characters of letters, digits, dash and underscore; anything else is dropped.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function ideatoapps_sanitize_youtube_id( $value ) {
	return is_string( $value ) && 1 === preg_match( '/^[A-Za-z0-9_-]{11}$/D', $value ) ? $value : '';
}

/**
 * The related app must be an existing `app` post; anything else (including a blog post or an unknown ID) becomes 0.
 *
 * @param mixed $value Raw value.
 * @return int
 */
function ideatoapps_sanitize_related_app_id( $value ) {
	$id = absint( $value );
	return $id > 0 && 'app' === get_post_type( $id ) ? $id : 0;
}

/**
 * Register the video meta keys. The callbacks run on already-unslashed values, so callers that write with
 * update_post_meta() must wp_slash() their input first (see ideatoapps_store_versions()).
 */
function ideatoapps_register_video_meta() {
	$common = array(
		'single'        => true,
		'show_in_rest'  => true,
		'auth_callback' => 'ideatoapps_meta_auth',
	);
	register_post_meta( 'video', 'youtube_id', $common + array( 'type' => 'string', 'sanitize_callback' => 'ideatoapps_sanitize_youtube_id', 'default' => '' ) );
	register_post_meta( 'video', 'related_app_id', $common + array( 'type' => 'integer', 'sanitize_callback' => 'ideatoapps_sanitize_related_app_id', 'default' => 0 ) );
}
add_action( 'init', 'ideatoapps_register_video_meta' );
