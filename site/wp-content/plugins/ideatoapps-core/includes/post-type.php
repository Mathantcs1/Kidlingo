<?php
/**
 * The `app` post type and its `app_category` taxonomy.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Register the app post type and category taxonomy.
 */
function ideatoapps_register_app_post_type() {
	register_post_type(
		'app',
		array(
			'labels'       => array(
				'name'          => __( 'Apps', 'ideatoapps-core' ),
				'singular_name' => __( 'App', 'ideatoapps-core' ),
				'add_new_item'  => __( 'Add new app', 'ideatoapps-core' ),
				'edit_item'     => __( 'Edit app', 'ideatoapps-core' ),
			),
			'public'       => true,
			'has_archive'  => 'apps',
			'rewrite'      => array( 'slug' => 'apps' ),
			'show_in_rest' => true,
			'menu_icon'    => 'dashicons-smartphone',
			'supports'     => array( 'title', 'editor', 'thumbnail', 'excerpt', 'revisions' ),
		)
	);

	register_taxonomy(
		'app_category',
		'app',
		array(
			'labels'       => array(
				'name'          => __( 'App categories', 'ideatoapps-core' ),
				'singular_name' => __( 'App category', 'ideatoapps-core' ),
			),
			'hierarchical' => true,
			'public'       => true,
			'show_in_rest' => true,
			'rewrite'      => array( 'slug' => 'apps/category' ),
		)
	);
}
add_action( 'init', 'ideatoapps_register_app_post_type' );
