<?php
/**
 * The "Subscribers only" box in the post editor. With the starter-article installer it is the only writer of `ita_gated` (1 or 0):
 * the key is protected meta (blog-review.php), so REST, XML-RPC and the Custom Fields box cannot set it. Saving it changes nothing
 * in the human review gate (it is not part of the sign-off hash and not watched by the publish guard).
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

add_action(
	'add_meta_boxes_post',
	static function (): void {
		add_meta_box( 'ita-gate', __( 'Subscribers only', 'ideatoapps-core' ), 'ideatoapps_gate_render_box', 'post', 'side', 'default' );
	}
);

/**
 * Render the box.
 *
 * @param WP_Post $post Post being edited.
 */
function ideatoapps_gate_render_box( $post ): void {
	$id = (int) $post->ID;
	wp_nonce_field( 'ita_gate_' . $id, 'ita_gate_nonce', false );
	echo '<input type="hidden" name="ita_gate_present" value="1">';
	echo '<p><label><input type="checkbox" name="ita_gated" value="1" data-testid="gate-box-checkbox"' . checked( '1', (string) get_post_meta( $id, 'ita_gated', true ), false ) . '> <strong>' . esc_html__( 'Subscribers only', 'ideatoapps-core' ) . '</strong></label></p>';
	echo '<p class="description">' . esc_html__( 'Visitors see the opening of the article and a free sign-up card. Confirmed newsletter subscribers read the whole article.', 'ideatoapps-core' ) . '</p>';
	if ( ! ideatoapps_newsletter_enabled() ) {
		echo '<p class="description" data-testid="gate-box-off"><strong>' . esc_html__( 'No effect right now: the newsletter sign-up is switched off (Settings > IdeaToApps), so everyone reads the whole article.', 'ideatoapps-core' ) . '</strong></p>';
	}
}

/**
 * Store the box: needs the box's own nonce for this post and the right to edit it. Unticked stores 0.
 *
 * @param int                 $post_id Post.
 * @param array<string,mixed> $req     Unslashed request fields.
 */
function ideatoapps_gate_save_box( int $post_id, array $req ): void {
	if ( empty( $req['ita_gate_present'] ) || ! isset( $req['ita_gate_nonce'] ) || ! is_string( $req['ita_gate_nonce'] ) ) {
		return;
	}
	if ( ! wp_verify_nonce( $req['ita_gate_nonce'], 'ita_gate_' . $post_id ) || ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}
	$new = ! empty( $req['ita_gated'] ) && '1' === (string) $req['ita_gated'] ? 1 : 0;
	$old = (string) get_post_meta( $post_id, 'ita_gated', true );
	update_post_meta( $post_id, 'ita_gated', $new );
	if ( (string) $new !== $old && ( '' !== $old || 1 === $new ) && function_exists( 'ideatoapps_reader_purge_caches' ) ) {
		ideatoapps_reader_purge_caches( $post_id ); // pages cached before the change must not keep serving the old version.
	}
}

add_action(
	'save_post_post',
	static function ( $post_id ): void {
		if ( wp_is_post_autosave( $post_id ) || wp_is_post_revision( $post_id ) ) {
			return;
		}
		ideatoapps_gate_save_box( (int) $post_id, wp_unslash( $_POST ) ); // phpcs:ignore WordPress.Security.NonceVerification.Missing -- verified in ideatoapps_gate_save_box().
	}
);
