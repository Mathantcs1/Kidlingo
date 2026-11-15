<?php
/**
 * Admin meta boxes for apps: registration, scripts and save handlers.
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
 * Load the media library and the small admin script on the app edit screen only.
 *
 * @param string $hook Admin page hook.
 */
function ideatoapps_enqueue_admin( $hook ) {
	$screen = get_current_screen();
	if ( ! in_array( $hook, array( 'post.php', 'post-new.php' ), true ) || ! $screen || 'app' !== $screen->post_type ) {
		return;
	}
	wp_enqueue_media();
	wp_enqueue_script( 'ideatoapps-admin-app', plugins_url( 'assets/admin-app.js', IDEATOAPPS_CORE_FILE ), array( 'jquery' ), IDEATOAPPS_CORE_VERSION, true );
}
add_action( 'admin_enqueue_scripts', 'ideatoapps_enqueue_admin' );

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
 * Unslashed, string-only list from a $_POST array field.
 *
 * @param string $key POST key.
 * @return string[]
 */
function ideatoapps_post_list( $key ) {
	// phpcs:ignore WordPress.Security.NonceVerification.Missing -- callers verify the nonce.
	$raw = isset( $_POST[ $key ] ) && is_array( $_POST[ $key ] ) ? wp_unslash( $_POST[ $key ] ) : array();
	return array_values( array_filter( $raw, 'is_string' ) );
}

/**
 * Build the stored features JSON from the one-per-line textarea.
 *
 * @param string $text Raw (unslashed) textarea text.
 * @return string JSON list.
 */
function ideatoapps_features_from_text( $text ) {
	$lines = array_filter( array_map( 'trim', preg_split( '/\R/', $text ) ), 'strlen' );
	return ideatoapps_encode_list( $lines );
}

/**
 * Build the stored FAQ JSON from the parallel question/answer arrays; fully empty rows are dropped.
 *
 * @param string[] $questions Questions.
 * @param string[] $answers   Answers.
 * @return string JSON list of {q, a}.
 */
function ideatoapps_faq_from_rows( array $questions, array $answers ) {
	$rows = array();
	foreach ( $questions as $i => $q ) {
		$a = $answers[ $i ] ?? '';
		if ( '' !== trim( $q ) || '' !== trim( $a ) ) {
			$rows[] = array( 'q' => $q, 'a' => $a );
		}
	}
	return ideatoapps_encode_list( $rows );
}

/**
 * Save the Product details box. update_post_meta() unslashes, so every value is re-slashed.
 *
 * @param int $post_id Post ID.
 */
function ideatoapps_save_details( $post_id ) {
	if ( ! ideatoapps_can_save( $post_id, 'ideatoapps_details_nonce', 'ideatoapps_save_details' ) ) {
		return;
	}
	$keys = array_merge( array_keys( ideatoapps_details_fields() ), array( 'delivery_status' ) );
	foreach ( $keys as $key ) {
		if ( isset( $_POST[ 'ita_' . $key ] ) && is_string( $_POST[ 'ita_' . $key ] ) ) {
			// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- sanitised by the registered meta sanitize_callback.
			update_post_meta( $post_id, $key, wp_slash( wp_unslash( $_POST[ 'ita_' . $key ] ) ) );
		}
	}
	if ( current_user_can( 'manage_options' ) && isset( $_POST['ita_woo_product_id'] ) && is_string( $_POST['ita_woo_product_id'] ) ) {
		update_post_meta( $post_id, 'woo_product_id', absint( wp_unslash( $_POST['ita_woo_product_id'] ) ) );
	}
	if ( isset( $_POST['ita_features'] ) && is_string( $_POST['ita_features'] ) ) {
		update_post_meta( $post_id, 'features', wp_slash( ideatoapps_features_from_text( wp_unslash( $_POST['ita_features'] ) ) ) );
	}
	if ( isset( $_POST['ita_faq_q'] ) ) {
		update_post_meta( $post_id, 'faq', wp_slash( ideatoapps_faq_from_rows( ideatoapps_post_list( 'ita_faq_q' ), ideatoapps_post_list( 'ita_faq_a' ) ) ) );
	}
}
add_action( 'save_post_app', 'ideatoapps_save_details' );

/**
 * Save the Versions box: edit/remove existing rows, then add one new version if submitted.
 *
 * @param int $post_id Post ID.
 */
function ideatoapps_save_versions( $post_id ) {
	if ( ! ideatoapps_can_save( $post_id, 'ideatoapps_versions_nonce', 'ideatoapps_save_versions' ) ) {
		return;
	}
	$post_id = (int) $post_id;
	$rows    = isset( $_POST['ita_ver'] ) && is_array( $_POST['ita_ver'] ) ? wp_unslash( $_POST['ita_ver'] ) : array();
	foreach ( $rows as $version => $row ) {
		$version = sanitize_text_field( (string) $version );
		if ( ! is_array( $row ) || ! ideatoapps_is_semver( $version ) ) {
			continue;
		}
		if ( ! empty( $row['remove'] ) ) {
			ideatoapps_remove_version( $post_id, $version );
			continue;
		}
		$changelog = isset( $row['changelog'] ) && is_string( $row['changelog'] ) ? sanitize_textarea_field( $row['changelog'] ) : '';
		$attach    = isset( $row['attachment'] ) ? absint( $row['attachment'] ) : 0;
		$current   = 0;
		foreach ( ideatoapps_get_versions( $post_id ) as $existing ) {
			if ( $existing['version'] === $version ) {
				$current = $existing['attachment_id'];
			}
		}
		if ( ! ideatoapps_can_use_version_attachment( $attach, $current ) ) {
			$attach = $current;
		}
		ideatoapps_update_version( $post_id, $version, $changelog, $attach );
	}

	$version = isset( $_POST['ita_new_version'] ) ? sanitize_text_field( wp_unslash( $_POST['ita_new_version'] ) ) : '';
	if ( '' === $version ) {
		return;
	}
	$changelog = isset( $_POST['ita_new_changelog'] ) ? sanitize_textarea_field( wp_unslash( $_POST['ita_new_changelog'] ) ) : '';
	$attach    = isset( $_POST['ita_new_attachment'] ) ? absint( wp_unslash( $_POST['ita_new_attachment'] ) ) : 0;
	$attach    = ideatoapps_can_use_version_attachment( $attach, 0 ) ? $attach : 0;
	if ( ! ideatoapps_is_semver( $version ) ) {
		/* translators: %s: the version the editor typed. */
		ideatoapps_add_notice( $post_id, sprintf( __( "Version '%s' was not added: use the form 1.2.3.", 'ideatoapps-core' ), $version ) );
	} elseif ( ! ideatoapps_add_version( $post_id, $version, $changelog, $attach ) ) {
		/* translators: %s: version number. */
		ideatoapps_add_notice( $post_id, sprintf( __( 'Version %s already exists.', 'ideatoapps-core' ), $version ) );
	}
}
add_action( 'save_post_app', 'ideatoapps_save_versions' );
