<?php
/**
 * Search is no oracle on a gated body. For a visitor who may not read gated posts (switch on; no valid reader cookie; and for posts
 * they cannot edit), every `post_content LIKE` of a WP_Query search (front-end ?s=, the blog ?q=, REST /wp/v2/posts?search= and
 * /wp/v2/search, quoted or sentence searches, `search_columns`) and of its relevance ORDER BY is fenced off for gated ids:
 *
 *   post_content LIKE x      ->  (ID NOT IN (gated) AND post_content LIKE x)
 *   post_content NOT LIKE x  ->  (ID IN (gated) OR post_content NOT LIKE x)
 *
 * So a gated post matches (and ranks) on its title and excerpt only, and every other post is searched exactly as before. This is
 * the reviewer's "(orig AND ID NOT IN gated) OR (title/excerpt-only AND ID IN gated)" written per column, which also stays valid
 * SQL when the content is the only searched column.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Ids of gated posts the current visitor may not search by body ([] when nothing is fenced).
 *
 * @return int[]
 */
function ideatoapps_reader_search_fenced_ids(): array {
	if ( ! ideatoapps_newsletter_enabled() || ideatoapps_reader_current_subscriber() > 0 ) {
		return array();
	}
	global $wpdb;
	$ids = array_map(
		'intval',
		$wpdb->get_col( "SELECT pm.post_id FROM {$wpdb->postmeta} pm INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id WHERE pm.meta_key = 'ita_gated' AND pm.meta_value = '1' AND p.post_type = 'post'" ) // phpcs:ignore WordPress.DB.DirectDatabaseQuery
	);
	return array_values( array_filter( $ids, static fn( int $id ) => $id > 0 && ! current_user_can( 'edit_post', $id ) ) );
}

/**
 * Fence every post_content LIKE / NOT LIKE in an SQL fragment.
 *
 * @param string $sql SQL fragment (search WHERE clause or relevance ORDER BY).
 * @param int[]  $ids      Gated ids to fence.
 * @param string $fallback What to return if the pattern engine fails (never the unfenced SQL).
 */
function ideatoapps_reader_fence_content_sql( string $sql, array $ids, string $fallback = ' AND 1=0 ' ): string {
	if ( ! $ids || '' === $sql ) {
		return $sql;
	}
	global $wpdb;
	$in  = implode( ',', array_map( 'intval', $ids ) );
	$col = preg_quote( $wpdb->posts, '/' ) . '\.post_content';
	$out = preg_replace_callback(
		"/{$col} (NOT )?LIKE ('(?:[^'\\\\]|\\\\.)*')/",
		static function ( array $m ) use ( $in, $wpdb ): string {
			return '' === $m[1]
				? "({$wpdb->posts}.ID NOT IN ({$in}) AND {$wpdb->posts}.post_content LIKE {$m[2]})"
				: "({$wpdb->posts}.ID IN ({$in}) OR {$wpdb->posts}.post_content NOT LIKE {$m[2]})";
		},
		$sql
	);
	return is_string( $out ) ? $out : $fallback; // a regex failure finds nothing (or drops the ranking) rather than leak.
}

add_filter(
	'posts_search',
	static function ( $search, $query ) {
		return is_string( $search ) && '' !== $search ? ideatoapps_reader_fence_content_sql( $search, ideatoapps_reader_search_fenced_ids() ) : $search;
	},
	99,
	2
);

add_filter(
	'posts_search_orderby',
	static function ( $orderby ) {
		return is_string( $orderby ) && '' !== $orderby ? ideatoapps_reader_fence_content_sql( $orderby, ideatoapps_reader_search_fenced_ids(), '' ) : $orderby;
	},
	99
);
