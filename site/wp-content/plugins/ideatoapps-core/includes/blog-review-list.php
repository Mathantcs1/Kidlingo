<?php
/**
 * Review display: the posts-list column and filter, the public byline and the "N of M reviewed" line.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

add_filter(
	'manage_post_posts_columns',
	static function ( $cols ) {
		$cols['ita_review'] = __( 'Review', 'ideatoapps-core' );
		return $cols;
	}
);

add_action(
	'manage_post_posts_custom_column',
	static function ( $col, $post_id ): void {
		if ( 'ita_review' === $col ) {
			$status = ideatoapps_review_status( (int) $post_id );
			echo '' === $status ? '&mdash;' : '<span data-testid="review-col">' . esc_html( ideatoapps_review_statuses()[ $status ] ) . '</span>';
		}
	},
	10,
	2
);

/** The requested filter value, validated. */
function ideatoapps_review_filter_value(): string {
	$v = isset( $_GET['ita_review'] ) && is_string( $_GET['ita_review'] ) ? sanitize_key( wp_unslash( $_GET['ita_review'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only list filter.
	return isset( ideatoapps_review_statuses()[ $v ] ) ? $v : '';
}

add_action(
	'restrict_manage_posts',
	static function ( $type ): void {
		if ( 'post' !== $type ) {
			return;
		}
		echo '<select name="ita_review" aria-label="' . esc_attr__( 'Filter by review status', 'ideatoapps-core' ) . '"><option value="">' . esc_html__( 'All review states', 'ideatoapps-core' ) . '</option>';
		foreach ( ideatoapps_review_statuses() as $key => $label ) {
			echo '<option value="' . esc_attr( $key ) . '"' . selected( ideatoapps_review_filter_value(), $key, false ) . '>' . esc_html( $label ) . '</option>';
		}
		echo '</select>';
	}
);

add_action(
	'pre_get_posts',
	static function ( $q ): void {
		global $pagenow;
		if ( is_admin() && $q->is_main_query() && 'edit.php' === $pagenow && 'post' === ( $q->get( 'post_type' ) ?: 'post' ) && '' !== ideatoapps_review_filter_value() ) {
			$q->set( 'meta_query', array( array( 'key' => 'ita_review_status', 'value' => ideatoapps_review_filter_value() ) ) ); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- admin list filter.
		}
	}
);

/**
 * Public byline for human-reviewed posts only; every other post shows nothing here.
 *
 * @param mixed $html    Byline so far.
 * @param mixed $post_id Post id.
 */
function ideatoapps_review_byline( $html, $post_id = 0 ) {
	$id   = (int) $post_id;
	$post = get_post( $id );
	if ( ! $post || '' !== (string) $html || 'human_reviewed' !== ideatoapps_review_status( $id ) || ! ideatoapps_review_is_cleared( $id, $post->post_content ) ) {
		return $html;
	}
	$on   = (string) get_post_meta( $id, 'ita_reviewed_on', true );
	$date = date_i18n( get_option( 'date_format' ), (int) strtotime( $on . ' 00:00:00 UTC' ) );
	/* translators: 1: reviewer name, 2: date. */
	return esc_html( sprintf( __( 'Drafted with AI assistance. Edited and reviewed by %1$s on %2$s.', 'ideatoapps-core' ), (string) get_post_meta( $id, 'ita_reviewer', true ), $date ) );
}
add_filter( 'ideatoapps_post_byline_html', 'ideatoapps_review_byline', 10, 2 );

/**
 * Counts for the Settings line: human reviewed starter posts out of the starter article files.
 *
 * @return array{reviewed:int,total:int}
 */
function ideatoapps_review_progress(): array {
	$ids = get_posts( array( 'post_type' => 'post', 'post_status' => array( 'draft', 'pending', 'private', 'publish', 'future' ), 'numberposts' => -1, 'fields' => 'ids', 'meta_query' => array( array( 'key' => 'ita_starter_slug', 'compare' => 'EXISTS' ), array( 'key' => 'ita_review_status', 'value' => 'human_reviewed' ) ) ) ); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- a few dozen rows.
	return array( 'reviewed' => count( $ids ), 'total' => count( ideatoapps_blog_article_files() ) );
}
