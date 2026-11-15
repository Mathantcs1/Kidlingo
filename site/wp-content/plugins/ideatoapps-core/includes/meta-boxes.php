<?php
/**
 * Admin meta boxes for apps: "Product details" and "Versions".
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Register the meta boxes.
 */
function ideatoapps_add_meta_boxes() {
	add_meta_box( 'ideatoapps_details', __( 'Product details', 'ideatoapps-core' ), 'ideatoapps_render_details_box', 'app', 'normal', 'high' );
	add_meta_box( 'ideatoapps_versions', __( 'Versions', 'ideatoapps-core' ), 'ideatoapps_render_versions_box', 'app', 'normal', 'default' );
}
add_action( 'add_meta_boxes_app', 'ideatoapps_add_meta_boxes' );

/**
 * Text-like fields in the Product details box: meta key => label.
 *
 * @return string[]
 */
function ideatoapps_details_fields() {
	return array(
		'tagline'     => __( 'Tagline', 'ideatoapps-core' ),
		'platforms'   => __( 'Platforms', 'ideatoapps-core' ),
		'price_label' => __( 'Price label', 'ideatoapps-core' ),
		'launch_url'  => __( 'Launch URL', 'ideatoapps-core' ),
		'demo_url'    => __( 'Demo URL', 'ideatoapps-core' ),
		'video_id'    => __( 'Video ID', 'ideatoapps-core' ),
	);
}

/**
 * Render the Product details box.
 *
 * @param WP_Post $post App post.
 */
function ideatoapps_render_details_box( $post ) {
	wp_nonce_field( 'ideatoapps_save_details', 'ideatoapps_details_nonce' );
	$status = get_post_meta( $post->ID, 'delivery_status', true );
	echo '<table class="form-table" role="presentation">';
	foreach ( ideatoapps_details_fields() as $key => $label ) {
		printf(
			'<tr><th><label for="ita_%1$s">%2$s</label></th><td><input type="text" class="large-text" id="ita_%1$s" name="ita_%1$s" value="%3$s"></td></tr>',
			esc_attr( $key ),
			esc_html( $label ),
			esc_attr( (string) get_post_meta( $post->ID, $key, true ) )
		);
	}
	echo '<tr><th><label for="ita_delivery_status">' . esc_html__( 'Delivery status', 'ideatoapps-core' ) . '</label></th><td><select id="ita_delivery_status" name="ita_delivery_status">';
	foreach ( array( 'draft', 'coming_soon', 'live' ) as $option ) {
		printf( '<option value="%1$s"%2$s>%1$s</option>', esc_attr( $option ), selected( $status, $option, false ) );
	}
	echo '</select></td></tr>';
	foreach ( array( 'features' => __( 'Features (JSON list of strings)', 'ideatoapps-core' ), 'faq' => __( 'FAQ (JSON list of {"q","a"})', 'ideatoapps-core' ) ) as $key => $label ) {
		printf(
			'<tr><th><label for="ita_%1$s">%2$s</label></th><td><textarea class="large-text code" rows="4" id="ita_%1$s" name="ita_%1$s">%3$s</textarea></td></tr>',
			esc_attr( $key ),
			esc_html( $label ),
			esc_textarea( (string) get_post_meta( $post->ID, $key, true ) )
		);
	}
	echo '</table>';
}

/**
 * Whether the current request may save the given box for this post.
 *
 * @param int    $post_id Post ID.
 * @param string $field   Nonce field name.
 * @param string $action  Nonce action.
 * @return bool
 */
function ideatoapps_can_save( $post_id, $field, $action ) {
	if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || wp_is_post_revision( $post_id ) ) {
		return false;
	}
	$nonce = isset( $_POST[ $field ] ) ? sanitize_text_field( wp_unslash( $_POST[ $field ] ) ) : '';
	if ( '' === $nonce || ! wp_verify_nonce( $nonce, $action ) ) {
		return false;
	}
	return 'app' === get_post_type( $post_id ) && current_user_can( 'edit_post', $post_id );
}

/**
 * Save the Product details box (sanitising happens in the registered meta callbacks).
 *
 * @param int $post_id Post ID.
 */
function ideatoapps_save_details( $post_id ) {
	if ( ! ideatoapps_can_save( $post_id, 'ideatoapps_details_nonce', 'ideatoapps_save_details' ) ) {
		return;
	}
	$keys = array_merge( array_keys( ideatoapps_details_fields() ), array( 'delivery_status', 'features', 'faq' ) );
	foreach ( $keys as $key ) {
		if ( isset( $_POST[ 'ita_' . $key ] ) && is_string( $_POST[ 'ita_' . $key ] ) ) {
			// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- sanitised by the registered meta sanitize_callback.
			update_post_meta( $post_id, $key, wp_unslash( $_POST[ 'ita_' . $key ] ) );
		}
	}
}
add_action( 'save_post_app', 'ideatoapps_save_details' );

/**
 * Render the Versions box.
 *
 * @param WP_Post $post App post.
 */
function ideatoapps_render_versions_box( $post ) {
	wp_nonce_field( 'ideatoapps_save_versions', 'ideatoapps_versions_nonce' );
	$versions = ideatoapps_get_versions( $post->ID );
	if ( $versions ) {
		echo '<table class="widefat striped"><thead><tr><th>' . esc_html__( 'Version', 'ideatoapps-core' ) . '</th><th>' . esc_html__( 'Released', 'ideatoapps-core' ) . '</th><th>' . esc_html__( 'File (attachment ID)', 'ideatoapps-core' ) . '</th><th>' . esc_html__( 'Changelog', 'ideatoapps-core' ) . '</th></tr></thead><tbody>';
		foreach ( $versions as $v ) {
			printf(
				'<tr><td>%s</td><td>%s</td><td>%d</td><td>%s</td></tr>',
				esc_html( $v['version'] ),
				esc_html( $v['released'] ),
				(int) $v['attachment_id'],
				esc_html( $v['changelog'] )
			);
		}
		echo '</tbody></table>';
	} else {
		echo '<p>' . esc_html__( 'No versions yet.', 'ideatoapps-core' ) . '</p>';
	}
	echo '<h4>' . esc_html__( 'Add a version', 'ideatoapps-core' ) . '</h4>';
	echo '<p><label>' . esc_html__( 'Version (x.y.z)', 'ideatoapps-core' ) . ' <input type="text" name="ita_new_version" pattern="\d+\.\d+\.\d+" placeholder="1.0.0"></label></p>';
	echo '<p><label>' . esc_html__( 'Changelog', 'ideatoapps-core' ) . '<br><textarea class="large-text" rows="3" name="ita_new_changelog"></textarea></label></p>';
	echo '<p><label>' . esc_html__( 'Attachment ID', 'ideatoapps-core' ) . ' <input type="number" min="0" name="ita_new_attachment"></label><br><span class="description">' . esc_html__( 'Upload the file in the Media Library and enter its attachment ID.', 'ideatoapps-core' ) . '</span></p>';
}

/**
 * Save the Versions box: adds one version when a version string was submitted.
 *
 * @param int $post_id Post ID.
 */
function ideatoapps_save_versions( $post_id ) {
	if ( ! ideatoapps_can_save( $post_id, 'ideatoapps_versions_nonce', 'ideatoapps_save_versions' ) ) {
		return;
	}
	$version = isset( $_POST['ita_new_version'] ) ? sanitize_text_field( wp_unslash( $_POST['ita_new_version'] ) ) : '';
	if ( '' === $version ) {
		return;
	}
	$changelog = isset( $_POST['ita_new_changelog'] ) ? sanitize_textarea_field( wp_unslash( $_POST['ita_new_changelog'] ) ) : '';
	$attach    = isset( $_POST['ita_new_attachment'] ) ? absint( wp_unslash( $_POST['ita_new_attachment'] ) ) : 0;
	ideatoapps_add_version( (int) $post_id, $version, $changelog, $attach );
}
add_action( 'save_post_app', 'ideatoapps_save_versions' );
