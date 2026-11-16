<?php
/**
 * Human review of AI-drafted posts: meta, helpers and the sign-off logic.
 *
 * Meta (all protected from REST, XML-RPC and the Custom Fields box): ita_review_status (ai_draft | needs_review | human_reviewed),
 * ita_reviewer (text, max 80), ita_reviewed_on (YYYY-MM-DD, site timezone), ita_reviewed_hash (hash of the content at sign-off).
 * Posts with neither ita_review_status nor ita_starter_slug (the owner's own posts) are not touched by any of this.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

const IDEATOAPPS_REVIEW_KEYS = array( 'ita_review_status', 'ita_reviewer', 'ita_reviewed_on', 'ita_reviewed_hash', 'ita_starter_hash', 'ita_drafted_on', 'ita_gated', 'ita_check', 'ita_starter_slug', 'ita_last_reviewed' );

add_filter(
	'is_protected_meta',
	static fn( $protected, $key ) => in_array( $key, IDEATOAPPS_REVIEW_KEYS, true ) ? true : $protected,
	10,
	2
);

/**
 * @return array<string, string> status => label.
 */
function ideatoapps_review_statuses(): array {
	return array(
		'ai_draft'       => __( 'AI draft', 'ideatoapps-core' ),
		'needs_review'   => __( 'Needs review', 'ideatoapps-core' ),
		'human_reviewed' => __( 'Human reviewed', 'ideatoapps-core' ),
	);
}

/**
 * The seven sign-off checks: key => label. All must be ticked.
 *
 * @return array<string, string>
 */
function ideatoapps_review_checklist(): array {
	return array(
		'facts'    => __( 'Facts and claims checked against sources', 'ideatoapps-core' ),
		'examples' => __( 'Examples tried or reworked', 'ideatoapps-core' ),
		'words'    => __( 'Intro and examples edited into my own words', 'ideatoapps-core' ),
		'prompts'  => __( 'Prompts tested in a real assistant', 'ideatoapps-core' ),
		'quiz'     => __( 'Quiz answers correct', 'ideatoapps-core' ),
		'links'    => __( 'Links and images checked', 'ideatoapps-core' ),
		'invented' => __( 'No invented stories or statistics', 'ideatoapps-core' ),
	);
}

/**
 * The fields a sign-off covers: title, excerpt and content, so a change to any of them after sign-off needs a new review.
 *
 * @param WP_Post|int|array<string,string> $src Post, post id or array with post_title, post_excerpt, post_content.
 * @return array{title:string,excerpt:string,content:string}
 */
function ideatoapps_review_fields( $src ): array {
	if ( is_int( $src ) || $src instanceof WP_Post ) {
		$src = get_post( $src );
		$src = $src ? array( 'post_title' => $src->post_title, 'post_excerpt' => $src->post_excerpt, 'post_content' => $src->post_content ) : array();
	}
	return array( 'title' => (string) ( $src['post_title'] ?? '' ), 'excerpt' => (string) ( $src['post_excerpt'] ?? '' ), 'content' => (string) ( $src['post_content'] ?? '' ) );
}

/** Hash of the reviewed fields (see ideatoapps_review_fields()). */
function ideatoapps_review_hash( array $fields ): string {
	return hash( 'sha256', (string) wp_json_encode( array( $fields['title'] ?? '', $fields['excerpt'] ?? '', $fields['content'] ?? '' ) ) );
}

/**
 * True while this code itself writes review meta, so the meta hooks do not fight the save that is in progress.
 */
function ideatoapps_review_busy( ?bool $set = null ): bool {
	static $busy = false;
	if ( null !== $set ) {
		$busy = $set;
	}
	return $busy;
}

/**
 * The review status that applies to a post: the stored one, ai_draft for a starter post without one, '' for any other post.
 */
function ideatoapps_review_status( int $post_id ): string {
	if ( 'post' !== get_post_type( $post_id ) ) {
		return '';
	}
	$status = get_post_meta( $post_id, 'ita_review_status', true );
	if ( is_string( $status ) && isset( ideatoapps_review_statuses()[ $status ] ) ) {
		return $status;
	}
	return '' !== (string) get_post_meta( $post_id, 'ita_starter_slug', true ) ? 'ai_draft' : '';
}

/**
 * Whether the post is signed off and unchanged: human_reviewed with a reviewer, a date and a matching content hash.
 */
function ideatoapps_review_is_cleared( int $post_id, array $fields ): bool {
	$name = (string) get_post_meta( $post_id, 'ita_reviewer', true );
	$on   = (string) get_post_meta( $post_id, 'ita_reviewed_on', true );
	$hash = (string) get_post_meta( $post_id, 'ita_reviewed_hash', true );
	return 'human_reviewed' === ideatoapps_review_status( $post_id ) && '' !== trim( $name ) && ideatoapps_blog_valid_date( $on ) && '' !== $hash && hash_equals( $hash, ideatoapps_review_hash( $fields ) );
}

/**
 * Sign a post off (or re-sign it). Needs capability publish_posts, a valid nonce, a reviewer name typed by the human and all
 * seven boxes ticked. The date is today in the site timezone.
 *
 * @param int                 $post_id Post.
 * @param string              $content Post content as it is (being) stored.
 * @param array<string,mixed> $req     Unslashed request fields: ita_review_nonce, ita_review_name, ita_review_check[].
 * @return string 'signed', or why not: ignored, forbidden, bad_nonce, no_name, name_too_long, unchecked.
 */
function ideatoapps_review_sign_off( int $post_id, array $fields, array $req ): string {
	$status = ideatoapps_review_status( $post_id );
	if ( '' === $status || 'human_reviewed' === $status && ideatoapps_review_is_cleared( $post_id, $fields ) ) {
		return 'ignored';
	}
	if ( ! current_user_can( 'publish_posts' ) || ! current_user_can( 'edit_post', $post_id ) ) {
		return 'forbidden';
	}
	$nonce = isset( $req['ita_review_nonce'] ) && is_string( $req['ita_review_nonce'] ) ? $req['ita_review_nonce'] : '';
	if ( '' === $nonce || ! wp_verify_nonce( $nonce, 'ita_review_' . $post_id ) ) {
		return 'bad_nonce';
	}
	$name = isset( $req['ita_review_name'] ) && is_string( $req['ita_review_name'] ) ? trim( sanitize_text_field( $req['ita_review_name'] ) ) : '';
	if ( '' === $name ) {
		return 'no_name';
	}
	if ( mb_strlen( $name ) > 80 ) {
		return 'name_too_long';
	}
	$ticked = isset( $req['ita_review_check'] ) && is_array( $req['ita_review_check'] ) ? array_map( 'strval', array_filter( $req['ita_review_check'], 'is_scalar' ) ) : array();
	if ( array_diff( array_keys( ideatoapps_review_checklist() ), $ticked ) ) {
		return 'unchecked';
	}
	$today = wp_date( 'Y-m-d' );
	ideatoapps_review_busy( true );
	update_post_meta( $post_id, 'ita_reviewer', wp_slash( $name ) );
	update_post_meta( $post_id, 'ita_reviewed_on', $today );
	update_post_meta( $post_id, 'ita_reviewed_hash', ideatoapps_review_hash( $fields ) );
	update_post_meta( $post_id, 'ita_review_status', 'human_reviewed' );
	update_post_meta( $post_id, 'ita_last_reviewed', $today ); // The "Last reviewed" line follows the human review, never the draft date.
	ideatoapps_review_busy( false );
	return 'signed';
}

/**
 * What the person sees for each sign-off outcome.
 *
 * @return array<string,string>
 */
function ideatoapps_review_messages(): array {
	return array(
		'signed'        => __( 'Signed off. The post is still a draft: press Publish again to put it live.', 'ideatoapps-core' ),
		'no_name'       => __( 'Not signed off: type your reviewer name.', 'ideatoapps-core' ),
		'name_too_long' => __( 'Not signed off: the reviewer name is longer than 80 characters.', 'ideatoapps-core' ),
		'unchecked'     => __( 'Not signed off: tick all seven checks.', 'ideatoapps-core' ),
		'bad_nonce'     => __( 'Not signed off: the form expired. Reload the page and try again.', 'ideatoapps-core' ),
		'forbidden'     => __( 'Not signed off: your account is not allowed to publish posts, so it cannot sign articles off.', 'ideatoapps-core' ),
	);
}

/**
 * Keep the outcome of a sign-off attempt (and what was typed) for the next time the box or the editor page is shown.
 *
 * @param array<string,mixed> $data code, name, ticks.
 */
function ideatoapps_review_remember( int $post_id, array $data ): void {
	if ( get_current_user_id() > 0 ) {
		set_transient( 'ita_review_res_' . get_current_user_id() . '_' . $post_id, $data, 600 );
	}
}

/**
 * @return array{code:string,name:string,ticks:string[]}|null
 */
function ideatoapps_review_recall( int $post_id, bool $consume ): ?array {
	$key  = 'ita_review_res_' . get_current_user_id() . '_' . $post_id;
	$data = get_current_user_id() > 0 ? get_transient( $key ) : false;
	if ( ! is_array( $data ) ) {
		return null;
	}
	if ( $consume ) {
		delete_transient( $key );
	}
	return array( 'code' => (string) ( $data['code'] ?? '' ), 'name' => (string) ( $data['name'] ?? '' ), 'ticks' => array_map( 'strval', (array) ( $data['ticks'] ?? array() ) ) );
}
