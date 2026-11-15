<?php
/**
 * Seed the ClipForge listing (app + WooCommerce product). Idempotent. Copy comes from ClipForge's README only.
 * It adds no versions and no files: no release zip exists yet.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * The ClipForge listing data.
 *
 * @return array<string, mixed>
 */
function ideatoapps_clipforge_listing() {
	return array(
		'tagline'     => 'Edit videos in your browser. Your files stay on your device.',
		'platforms'   => 'Chromium-based desktop browser (Safari untested); Python 3 or Node.js to run the local launcher',
		'price_label' => '$24.99 one-time',
		'notes'       => 'Chromium-based desktop browser (Safari untested). Python 3 or Node.js is needed to run the included local launcher.',
		'features'    => array(
			'Import video, audio and images, including screen recordings without sound',
			'Arrange, trim and split clips on a timeline; ripple delete; snapping',
			'Stack video layers and audio tracks (up to 8 of each) with mute, solo, lock and hide',
			'Move, scale and rotate a clip on the preview for picture-in-picture',
			'YouTube 16:9, Vertical 9:16, Square 1:1 and Portrait 4:5 formats',
			'Undo/redo and autosave in your browser',
			'Export MP4 (H.264 + AAC) at 1080p or 4K',
			'Runs locally: your media is never uploaded',
		),
		'faq'         => array(
			array(
				'q' => 'Do I need an internet connection?',
				'a' => 'Once downloaded, ClipForge runs from your computer, and your media never leaves it.',
			),
			array(
				'q' => 'Which browsers work?',
				'a' => 'ClipForge is tested in desktop Chrome. Safari is untested.',
			),
			array(
				'q' => 'How do I get updates?',
				'a' => 'New versions are listed under What\'s new on this page when they are released.',
			),
		),
	);
}

/**
 * The product for an app: the linked one if it still exists, else one tagged for this app (no orphans), else a new one.
 * Products carry `_ideatoapps_app_id` so a re-run finds them.
 *
 * @param int $app_id App post ID.
 * @return int Product ID, 0 when WooCommerce is not available.
 */
function ideatoapps_seed_clipforge_product( $app_id ) {
	if ( ! ideatoapps_woocommerce_active() || ! class_exists( 'WC_Product_Simple' ) ) {
		return 0;
	}
	$linked = (int) get_post_meta( $app_id, 'woo_product_id', true );
	if ( $linked > 0 && 'product' === get_post_type( $linked ) && 'trash' !== get_post_status( $linked ) ) {
		return $linked;
	}
	$found = get_posts(
		array(
			'post_type'      => 'product',
			'post_status'    => array( 'any', 'trash' ),
			'meta_key'       => '_ideatoapps_app_id', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- one row.
			'meta_value'     => $app_id, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			'posts_per_page' => 1,
			'fields'         => 'ids',
		)
	);
	if ( $found ) {
		if ( 'trash' === get_post_status( $found[0] ) ) {
			wp_untrash_post( $found[0] );
			wp_update_post( array( 'ID' => $found[0], 'post_status' => 'publish' ) );
		}
		return (int) $found[0];
	}
	$product = new WC_Product_Simple();
	$product->set_name( 'ClipForge' );
	$product->set_status( 'publish' );
	$product->set_regular_price( '24.99' );
	$product->set_virtual( true );
	$product->set_downloadable( true );
	$product_id = (int) $product->save();
	update_post_meta( $product_id, '_ideatoapps_app_id', $app_id );
	return $product_id;
}

/**
 * Create the ClipForge app (and product) unless it already exists. A trashed app is restored, not duplicated, and a
 * missing product link is repaired when WooCommerce is active.
 *
 * @return int The app post ID (the existing one when already seeded).
 */
function ideatoapps_seed_clipforge() {
	$existing = get_posts(
		array(
			'post_type'      => 'app',
			'post_name__in'  => array( 'clipforge', 'clipforge__trashed' ), // WordPress renames the slug of a trashed post.
			'post_status'    => array( 'any', 'trash' ),
			'posts_per_page' => 1,
			'fields'         => 'ids',
		)
	);
	if ( $existing ) {
		$id = (int) $existing[0];
		if ( 'trash' === get_post_status( $id ) ) {
			wp_untrash_post( $id );
			wp_update_post( array( 'ID' => $id, 'post_status' => 'publish', 'post_name' => 'clipforge' ) );
		}
		$product_id = ideatoapps_seed_clipforge_product( $id );
		if ( $product_id > 0 ) {
			update_post_meta( $id, 'woo_product_id', $product_id );
		}
		return $id;
	}

	$data = ideatoapps_clipforge_listing();
	$id   = wp_insert_post(
		wp_slash(
			array(
				'post_type'    => 'app',
				'post_title'   => 'ClipForge',
				'post_name'    => 'clipforge',
				'post_status'  => 'publish',
				'post_content' => '<p>' . $data['notes'] . '</p>',
			)
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		return 0;
	}
	$meta = array(
		'tagline'         => $data['tagline'],
		'platforms'       => $data['platforms'],
		'price_label'     => $data['price_label'],
		'delivery_status' => 'live',
		'features'        => ideatoapps_encode_list( $data['features'] ),
		'faq'             => ideatoapps_encode_list( $data['faq'] ),
	);
	foreach ( $meta as $key => $value ) {
		update_post_meta( $id, $key, wp_slash( $value ) );
	}
	wp_set_object_terms( $id, 'Creator', 'app_category' );
	$product_id = ideatoapps_seed_clipforge_product( $id );
	if ( $product_id > 0 ) {
		update_post_meta( $id, 'woo_product_id', $product_id );
	}
	return (int) $id;
}

if ( defined( 'WP_CLI' ) && WP_CLI ) {
	/**
	 * Create the ClipForge listing and its WooCommerce product (safe to run again).
	 */
	WP_CLI::add_command(
		'ideatoapps seed-clipforge',
		static function () {
			$id = ideatoapps_seed_clipforge();
			if ( $id <= 0 ) {
				WP_CLI::error( 'Could not create the ClipForge app.' );
			}
			WP_CLI::success( sprintf( 'ClipForge app ready (ID %d): %s', $id, get_permalink( $id ) ) );
		}
	);
}
