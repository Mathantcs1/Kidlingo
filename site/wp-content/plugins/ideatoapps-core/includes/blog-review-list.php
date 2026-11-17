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
			$want = ideatoapps_review_filter_value();
			$is   = array( 'key' => 'ita_review_status', 'value' => $want );
			// A starter post without a stored status counts as an AI draft.
			$q->set( 'meta_query', 'ai_draft' === $want ? array( 'relation' => 'OR', $is, array( 'relation' => 'AND', array( 'key' => 'ita_starter_slug', 'compare' => 'EXISTS' ), array( 'key' => 'ita_review_status', 'compare' => 'NOT EXISTS' ) ) ) : array( $is ) ); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- admin list filter.
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
	if ( ! $post || 'human_reviewed' !== ideatoapps_review_status( $id ) || ! ideatoapps_review_is_cleared( $id, ideatoapps_review_fields( $post ) ) ) {
		return $html;
	}
	$on   = (string) get_post_meta( $id, 'ita_reviewed_on', true );
	$date = date_i18n( get_option( 'date_format' ), (int) strtotime( $on . ' 00:00:00 UTC' ) );
	/* translators: 1: reviewer name, 2: date. */
	$line = esc_html( sprintf( __( 'Drafted with AI assistance. Edited and reviewed by %1$s on %2$s.', 'ideatoapps-core' ), (string) get_post_meta( $id, 'ita_reviewer', true ), $date ) );
	// The honest line always comes first; whatever another filter put there follows it and cannot replace it.
	return '' === (string) $html ? $line : $line . ' ' . $html;
}
add_filter( 'ideatoapps_post_byline_html', 'ideatoapps_review_byline', 999, 2 );

// "Last reviewed" for a post under review is the human review date; before sign-off there is none.
add_filter(
	'ideatoapps_last_reviewed',
	static function ( $date, $post_id ) {
		if ( '' === ideatoapps_review_status( (int) $post_id ) ) {
			return $date;
		}
		$on   = (string) get_post_meta( (int) $post_id, 'ita_reviewed_on', true );
		$post = get_post( (int) $post_id );
		$ok   = $post && 'human_reviewed' === ideatoapps_review_status( (int) $post_id ) && ideatoapps_review_is_cleared( (int) $post_id, ideatoapps_review_fields( $post ) ); // as the byline: the text must still match the sign-off.
		return $ok && ideatoapps_blog_valid_date( $on ) ? $on : null;
	},
	10,
	2
);

/**
 * Progress for the Settings line. Every article file is either installed (its post exists in any status; `trashed` of those are in the
 * trash) or not installed, so installed + missing = number of files. `reviewed` counts human reviewed posts that are not in the trash.
 *
 * @return array{reviewed:int,installed:int,missing:int,trashed:int}
 */
function ideatoapps_review_progress(): array {
	$st      = ideatoapps_blog_install_status();
	$trashed = 0;
	$done    = 0;
	foreach ( ideatoapps_blog_article_files() as $path ) {
		$id = ideatoapps_blog_post_for_slug( basename( $path, '.php' ) );
		if ( $id > 0 ) {
			$trashed += 'trash' === get_post_status( $id ) ? 1 : 0;
			$done    += 'trash' !== get_post_status( $id ) && 'human_reviewed' === ideatoapps_review_status( $id ) ? 1 : 0;
		}
	}
	return array( 'reviewed' => $done, 'installed' => $st['installed'], 'missing' => $st['total'] - $st['installed'], 'trashed' => $trashed );
}
