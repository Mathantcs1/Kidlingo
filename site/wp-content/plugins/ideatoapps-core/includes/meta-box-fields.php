<?php
/**
 * Rendering of the app meta boxes (all output escaped).
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

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
 * Human labels for the delivery status keys.
 *
 * @return string[]
 */
function ideatoapps_delivery_status_labels() {
	return array(
		'draft'       => __( 'Draft', 'ideatoapps-core' ),
		'coming_soon' => __( 'Coming soon', 'ideatoapps-core' ),
		'live'        => __( 'Live', 'ideatoapps-core' ),
	);
}

/**
 * One FAQ editing row.
 *
 * @param string $q Question.
 * @param string $a Answer.
 */
function ideatoapps_render_faq_row( $q, $a ) {
	printf(
		'<div class="ita-faq-row" style="margin-bottom:10px"><input type="text" class="large-text" name="ita_faq_q[]" placeholder="%1$s" value="%2$s"><textarea class="large-text" rows="2" name="ita_faq_a[]" placeholder="%3$s">%4$s</textarea> <button type="button" class="button-link ita-faq-remove">%5$s</button></div>',
		esc_attr__( 'Question', 'ideatoapps-core' ),
		esc_attr( $q ),
		esc_attr__( 'Answer', 'ideatoapps-core' ),
		esc_textarea( $a ),
		esc_html__( 'Remove', 'ideatoapps-core' )
	);
}

/**
 * Render the Product details box.
 *
 * @param WP_Post $post App post.
 */
function ideatoapps_render_details_box( $post ) {
	wp_nonce_field( 'ideatoapps_save_details', 'ideatoapps_details_nonce' );
	$status   = get_post_meta( $post->ID, 'delivery_status', true );
	$features = ideatoapps_decode_list( get_post_meta( $post->ID, 'features', true ) );
	$faq      = ideatoapps_decode_list( get_post_meta( $post->ID, 'faq', true ) );
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
	foreach ( ideatoapps_delivery_status_labels() as $option => $label ) {
		printf( '<option value="%1$s"%2$s>%3$s</option>', esc_attr( $option ), selected( $status, $option, false ), esc_html( $label ) );
	}
	echo '</select></td></tr>';
	if ( current_user_can( 'manage_options' ) ) { // Linking a product decides what the buy button charges: administrators only.
		printf(
			'<tr><th><label for="ita_woo_product_id">%1$s</label></th><td><input type="text" class="regular-text" id="ita_woo_product_id" name="ita_woo_product_id" value="%2$s"></td></tr>',
			esc_html__( 'WooCommerce product ID', 'ideatoapps-core' ),
			esc_attr( (string) get_post_meta( $post->ID, 'woo_product_id', true ) )
		);
	}
	printf(
		'<tr><th><label for="ita_features">%1$s</label></th><td><textarea class="large-text" rows="5" id="ita_features" name="ita_features">%2$s</textarea><p class="description">%3$s</p></td></tr>',
		esc_html__( 'Features', 'ideatoapps-core' ),
		esc_textarea( implode( "\n", array_filter( $features, 'is_string' ) ) ),
		esc_html__( 'One feature per line.', 'ideatoapps-core' )
	);
	// The marker is posted even when every row was removed (no ita_faq_q[] then), so the save knows the FAQ was in the form.
	echo '<tr><th>' . esc_html__( 'FAQ', 'ideatoapps-core' ) . '</th><td><input type="hidden" name="ita_faq_present" value="1"><div id="ita-faq-rows">';
	$has_rows = false;
	foreach ( $faq as $row ) {
		if ( is_array( $row ) && isset( $row['q'], $row['a'] ) ) {
			ideatoapps_render_faq_row( (string) $row['q'], (string) $row['a'] );
			$has_rows = true;
		}
	}
	if ( ! $has_rows ) {
		ideatoapps_render_faq_row( '', '' );
	}
	echo '</div><template id="ita-faq-template">';
	ideatoapps_render_faq_row( '', '' );
	echo '</template><button type="button" class="button" id="ita-faq-add">' . esc_html__( 'Add question', 'ideatoapps-core' ) . '</button></td></tr></table>';
}

/**
 * File picker: hidden attachment ID, shown filename and a "Choose file" button.
 *
 * @param string $input_name Hidden input name.
 * @param int    $attachment Attachment ID (0 for none).
 */
function ideatoapps_render_file_picker( $input_name, $attachment ) {
	$name = '';
	if ( $attachment ) {
		$name = wp_basename( (string) get_attached_file( $attachment ) );
		$name = '' !== $name ? $name : '#' . $attachment;
	}
	printf(
		'<span class="ita-file"><input type="hidden" name="%1$s" value="%2$d"><span class="ita-file-name">%3$s</span> <button type="button" class="button ita-pick" data-title="%4$s">%5$s</button></span>',
		esc_attr( $input_name ),
		(int) $attachment,
		esc_html( $name ),
		esc_attr__( 'Choose the version file', 'ideatoapps-core' ),
		esc_html__( 'Choose file', 'ideatoapps-core' )
	);
}

/**
 * Render the Versions box.
 *
 * @param WP_Post $post App post.
 */
function ideatoapps_render_versions_box( $post ) {
	wp_nonce_field( 'ideatoapps_save_versions', 'ideatoapps_versions_nonce' );
	$versions = ideatoapps_get_versions( $post->ID );
	if ( $versions ) {
		echo '<table class="widefat striped"><thead><tr><th>' . esc_html__( 'Version', 'ideatoapps-core' ) . '</th><th>' . esc_html__( 'Released', 'ideatoapps-core' ) . '</th><th>' . esc_html__( 'File', 'ideatoapps-core' ) . '</th><th>' . esc_html__( 'Changelog', 'ideatoapps-core' ) . '</th><th>' . esc_html__( 'Remove', 'ideatoapps-core' ) . '</th></tr></thead><tbody>';
		foreach ( $versions as $v ) {
			$base = 'ita_ver[' . $v['version'] . ']';
			echo '<tr><td>' . esc_html( $v['version'] ) . '</td><td>' . esc_html( $v['released'] ) . '</td><td>';
			ideatoapps_render_file_picker( $base . '[attachment]', $v['attachment_id'] );
			printf(
				'</td><td><textarea class="large-text" rows="2" name="%1$s[changelog]">%2$s</textarea></td><td><input type="checkbox" name="%1$s[remove]" value="1"></td></tr>',
				esc_attr( $base ),
				esc_textarea( $v['changelog'] )
			);
		}
		echo '</tbody></table>';
	} else {
		echo '<p>' . esc_html__( 'No versions yet.', 'ideatoapps-core' ) . '</p>';
	}
	echo '<h4>' . esc_html__( 'Add a version', 'ideatoapps-core' ) . '</h4>';
	echo '<p><label>' . esc_html__( 'Version (x.y.z)', 'ideatoapps-core' ) . ' <input type="text" name="ita_new_version" pattern="\d+\.\d+\.\d+" placeholder="1.0.0"></label></p>';
	echo '<p><label>' . esc_html__( 'Changelog', 'ideatoapps-core' ) . '<br><textarea class="large-text" rows="3" name="ita_new_changelog"></textarea></label></p><p>';
	ideatoapps_render_file_picker( 'ita_new_attachment', 0 );
	echo '</p>';
}
