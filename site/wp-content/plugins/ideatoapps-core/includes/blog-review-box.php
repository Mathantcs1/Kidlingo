<?php
/**
 * The "Editorial review" box in the post editor. Signing off is handled by ideatoapps_review_sign_off() while the post is saved
 * (see blog-review-gate.php), so the same click that signs a post can also publish it.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * The article's "check these claims first" list from the header (stored as JSON).
 *
 * @return string[]
 */
function ideatoapps_review_claims( int $post_id ): array {
	$list = json_decode( (string) get_post_meta( $post_id, 'ita_check', true ), true );
	return is_array( $list ) ? array_values( array_filter( array_map( 'strval', array_filter( $list, 'is_scalar' ) ), 'strlen' ) ) : array();
}

add_action(
	'add_meta_boxes_post',
	static function (): void {
		add_meta_box( 'ita-review', __( 'Editorial review', 'ideatoapps-core' ), 'ideatoapps_review_render_box', 'post', 'side', 'high' );
	}
);

/**
 * Render the box.
 *
 * @param WP_Post $post Post being edited.
 */
function ideatoapps_review_render_box( $post ): void {
	$id     = (int) $post->ID;
	$status = ideatoapps_review_status( $id );
	if ( '' === $status ) {
		echo '<p>' . esc_html__( 'This post is not an AI-drafted starter article, so no review is required.', 'ideatoapps-core' ) . '</p>';
		return;
	}
	$labels = ideatoapps_review_statuses();
	$name   = (string) get_post_meta( $id, 'ita_reviewer', true );
	$on     = (string) get_post_meta( $id, 'ita_reviewed_on', true );
	echo '<div data-testid="review-box">';
	echo '<p><strong>' . esc_html__( 'Status:', 'ideatoapps-core' ) . '</strong> <span data-testid="review-status">' . esc_html( $labels[ $status ] ) . '</span></p>';
	if ( 'human_reviewed' === $status && '' !== $name ) {
		/* translators: 1: reviewer name, 2: date. */
		echo '<p>' . esc_html( sprintf( __( 'Reviewed by %1$s on %2$s.', 'ideatoapps-core' ), $name, $on ) ) . '</p>';
	} else {
		echo '<p class="description">' . esc_html__( 'This article cannot be published until a person has reviewed it.', 'ideatoapps-core' ) . '</p>';
	}
	$claims = ideatoapps_review_claims( $id );
	if ( $claims ) {
		echo '<h4>' . esc_html__( 'Check these claims first', 'ideatoapps-core' ) . '</h4><ul data-testid="review-claims" style="list-style:disc;margin-left:1.2em">';
		foreach ( $claims as $claim ) {
			echo '<li>' . esc_html( $claim ) . '</li>';
		}
		echo '</ul>';
	}
	if ( 'human_reviewed' !== $status ) {
		wp_nonce_field( 'ita_review_' . $id, 'ita_review_nonce', false );
		echo '<h4>' . esc_html__( 'Sign-off checklist', 'ideatoapps-core' ) . '</h4>';
		foreach ( ideatoapps_review_checklist() as $key => $label ) {
			echo '<p style="margin:.3em 0"><label><input type="checkbox" name="ita_review_check[]" value="' . esc_attr( $key ) . '"> ' . esc_html( $label ) . '</label></p>';
		}
		echo '<p><label for="ita-review-name"><strong>' . esc_html__( 'Reviewer name (required)', 'ideatoapps-core' ) . '</strong></label><br>';
		echo '<input type="text" id="ita-review-name" name="ita_review_name" class="widefat" maxlength="80" value="" aria-required="true" autocomplete="off"></p>';
		$label = 'needs_review' === $status ? __( 'Re-sign: mark as human reviewed again', 'ideatoapps-core' ) : __( 'Mark as human reviewed', 'ideatoapps-core' );
		echo '<p><label><input type="checkbox" name="ita_review_sign" value="1" data-testid="review-sign"> <strong>' . esc_html( $label ) . '</strong></label></p>';
		echo '<p class="description">' . esc_html__( 'Takes effect when you save, and only with your name and all seven boxes ticked.', 'ideatoapps-core' ) . '</p>';
	}
	echo '</div>';
}
