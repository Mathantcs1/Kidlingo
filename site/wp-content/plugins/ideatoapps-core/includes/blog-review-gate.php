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
	if ( $id <= 0 || ! is_array( $data ) || '' === ideatoapps_review_status( $id ) ) {
		return $data;
	}
	$fields = ideatoapps_review_fields( array_map( 'wp_unslash', array( 'post_title' => (string) ( $data['post_title'] ?? '' ), 'post_excerpt' => (string) ( $data['post_excerpt'] ?? '' ), 'post_content' => (string) ( $data['post_content'] ?? '' ) ) ) );
	// phpcs:disable WordPress.Security.NonceVerification.Missing -- ideatoapps_review_sign_off() verifies the nonce.
	if ( ! empty( $_POST['ita_review_sign'] ) && isset( $_POST['post_ID'] ) && (int) $_POST['post_ID'] === $id ) {
		$req  = wp_unslash( $_POST );
		$code = ideatoapps_review_sign_off( $id, $fields, $req );
		if ( 'ignored' !== $code ) {
			ideatoapps_review_remember( $id, array( 'code' => $code, 'name' => 'signed' === $code ? '' : (string) ( $req['ita_review_name'] ?? '' ), 'ticks' => 'signed' === $code ? array() : (array) ( $req['ita_review_check'] ?? array() ) ) );
		}
	}
	// phpcs:enable
	if ( 'human_reviewed' === ideatoapps_review_status( $id ) && ! ideatoapps_review_is_cleared( $id, $fields ) ) {
		ideatoapps_review_busy( true );
		update_post_meta( $id, 'ita_review_status', 'needs_review' ); // Title, excerpt or content edited after sign-off.
		ideatoapps_review_busy( false );
	}
	if ( ! ideatoapps_review_is_cleared( $id, $fields ) ) {
		$data['post_type'] = get_post_type( $id ); // An unreviewed post cannot be turned into a page or anything else.
		if ( in_array( $data['post_status'] ?? '', array( 'publish', 'future' ), true ) ) {
			$data['post_status'] = 'draft';
			ideatoapps_review_flag_refusal();
		}
	}
	return $data;
}
add_filter( 'wp_insert_post_data', 'ideatoapps_review_filter_insert', 99, 2 );

/**
 * Back to draft when something published a gated post without going through wp_insert_post_data.
 * Known limit: for wp_publish_post() the publish_post and transition actions of the first publish have already run when this pulls the post back.
 */
function ideatoapps_review_force_draft( int $post_id ): void {
	$post = get_post( $post_id );
	if ( ! $post || '' === ideatoapps_review_status( $post_id ) || ideatoapps_review_is_cleared( $post_id, ideatoapps_review_fields( $post ) ) ) {
		return;
	}
	if ( 'post' !== $post->post_type ) {
		set_post_type( $post_id, 'post' ); // Runs no filter: an unreviewed post that was switched to another type comes back.
	}
	if ( in_array( $post->post_status, array( 'publish', 'future' ), true ) ) {
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

// Any save of a gated post is re-checked once it is stored (covers anything that changed type or status without the insert filter).
add_action(
	'wp_after_insert_post',
	static function ( $post_id ): void {
		ideatoapps_review_force_draft( (int) $post_id );
	}
);

// Importer pattern: a post published first and given the starter / review meta afterwards (add_post_meta, update_post_meta).
foreach ( array( 'added_post_meta', 'updated_post_meta', 'deleted_post_meta' ) as $ideatoapps_hook ) {
	add_action(
		$ideatoapps_hook,
		static function ( $meta_id, $post_id, $key ): void {
			if ( ! ideatoapps_review_busy() && in_array( $key, array( 'ita_review_status', 'ita_starter_slug', 'ita_reviewed_hash', 'ita_reviewer', 'ita_reviewed_on' ), true ) ) {
				ideatoapps_review_force_draft( (int) $post_id );
			}
		},
		10,
		3
	);
}

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
		$user = get_current_user_id();
		if ( $user > 0 && get_transient( 'ita_review_refused_' . $user ) ) {
			delete_transient( 'ita_review_refused_' . $user );
			echo '<div class="notice notice-error is-dismissible" data-testid="review-refused"><p>' . esc_html__( 'Not published: needs human review. Sign the article off in the "Editorial review" box first.', 'ideatoapps-core' ) . '</p></div>';
		}
		$post = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only.
		$res  = $post > 0 ? ideatoapps_review_recall( $post, false ) : null;
		$msgs = ideatoapps_review_messages();
		if ( $res && isset( $msgs[ $res['code'] ] ) ) {
			echo '<div class="notice notice-' . ( 'signed' === $res['code'] ? 'success' : 'error' ) . '" data-testid="review-result"><p>' . esc_html( $msgs[ $res['code'] ] ) . '</p></div>';
		}
	}
);
