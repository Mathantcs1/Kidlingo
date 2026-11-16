<?php
/**
 * The publish gate. A post that has ita_starter_slug or a review status of ai_draft / needs_review cannot be publish or future.
 * It runs in wp_insert_post_data, so editor, quick edit, bulk edit, REST, XML-RPC and WP-CLI are all covered; the
 * transition_post_status and REST hooks below catch the paths that skip it (wp_publish_post, meta sent with the same REST request).
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/** Remember, for the current user, that a publish attempt was refused. */
function ideatoapps_review_flag_refusal(): void {
	if ( get_current_user_id() > 0 ) {
		set_transient( 'ita_review_refused_' . get_current_user_id(), 1, 120 );
	}
}

/**
 * wp_insert_post_data: sign-off in the same request, edit-after-sign-off reset, then the publish guard.
 *
 * @param array<string,mixed> $data    Slashed post data.
 * @param array<string,mixed> $postarr Raw post array.
 * @return array<string,mixed>
 */
function ideatoapps_review_filter_insert( $data, $postarr ) {
	$id = isset( $postarr['ID'] ) ? (int) $postarr['ID'] : 0;
	if ( $id <= 0 || ! is_array( $data ) || 'post' !== ( $data['post_type'] ?? '' ) || '' === ideatoapps_review_status( $id ) ) {
		return $data;
	}
	$content = wp_unslash( (string) ( $data['post_content'] ?? '' ) );
	// phpcs:disable WordPress.Security.NonceVerification.Missing -- ideatoapps_review_sign_off() verifies the nonce.
	if ( ! empty( $_POST['ita_review_sign'] ) && isset( $_POST['post_ID'] ) && (int) $_POST['post_ID'] === $id ) {
		ideatoapps_review_sign_off( $id, $content, wp_unslash( $_POST ) );
	}
	// phpcs:enable
	if ( 'human_reviewed' === ideatoapps_review_status( $id ) && ! ideatoapps_review_is_cleared( $id, $content ) ) {
		update_post_meta( $id, 'ita_review_status', 'needs_review' ); // Edited after sign-off.
	}
	if ( in_array( $data['post_status'] ?? '', array( 'publish', 'future' ), true ) && ! ideatoapps_review_is_cleared( $id, $content ) ) {
		$data['post_status'] = 'draft';
		ideatoapps_review_flag_refusal();
	}
	return $data;
}
add_filter( 'wp_insert_post_data', 'ideatoapps_review_filter_insert', 99, 2 );

/** Back to draft when something published a gated post without going through wp_insert_post_data. */
function ideatoapps_review_force_draft( int $post_id ): void {
	$post = get_post( $post_id );
	if ( $post && 'post' === $post->post_type && in_array( $post->post_status, array( 'publish', 'future' ), true ) && '' !== ideatoapps_review_status( $post_id ) && ! ideatoapps_review_is_cleared( $post_id, $post->post_content ) ) {
		wp_update_post( array( 'ID' => $post_id, 'post_status' => 'draft' ) );
		ideatoapps_review_flag_refusal();
	}
}

add_action(
	'transition_post_status',
	static function ( $new, $old, $post ): void {
		if ( $post instanceof WP_Post && in_array( $new, array( 'publish', 'future' ), true ) && $new !== $old ) {
			ideatoapps_review_force_draft( $post->ID );
		}
	},
	10,
	3
);

// REST writes meta after the insert, so a post created or updated as published with the starter meta in one request is checked here.
add_action(
	'rest_after_insert_post',
	static function ( $post ): void {
		if ( $post instanceof WP_Post ) {
			ideatoapps_review_force_draft( $post->ID );
		}
	}
);

add_action(
	'admin_notices',
	static function (): void {
		$key = 'ita_review_refused_' . get_current_user_id();
		if ( get_current_user_id() > 0 && get_transient( $key ) ) {
			delete_transient( $key );
			echo '<div class="notice notice-error is-dismissible" data-testid="review-refused"><p>' . esc_html__( 'Not published: needs human review. Sign the article off in the "Editorial review" box first.', 'ideatoapps-core' ) . '</p></div>';
		}
	}
);
