<?php
/**
 * Reader levels and audiences of blog posts (post meta `ita_level`, `ita_audiences` written by the starter-article installer).
 * Only the known values are ever used: anything else in the meta or the request is ignored.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Levels, easiest first: slug => label.
 *
 * @return array<string, string>
 */
function ideatoapps_blog_levels(): array {
	return array(
		'beginner'     => __( 'Beginner', 'ideatoapps' ),
		'intermediate' => __( 'Intermediate', 'ideatoapps' ),
		'advanced'     => __( 'Advanced', 'ideatoapps' ),
	);
}

/**
 * Audiences: slug => label.
 *
 * @return array<string, string>
 */
function ideatoapps_blog_audience_labels(): array {
	return array(
		'beginners'                   => __( 'Beginners', 'ideatoapps' ),
		'students'                    => __( 'Students', 'ideatoapps' ),
		'teachers-and-tutors'         => __( 'Teachers and tutors', 'ideatoapps' ),
		'parents-and-families'        => __( 'Parents and families', 'ideatoapps' ),
		'workers-and-business-owners' => __( 'Workers and business owners', 'ideatoapps' ),
		'creators'                    => __( 'Creators', 'ideatoapps' ),
		'builders'                    => __( 'Builders', 'ideatoapps' ),
	);
}

/**
 * A level from user input or meta: one of the three slugs exactly (case-sensitive), else ''.
 *
 * @param mixed $raw Raw value.
 */
function ideatoapps_blog_clean_level( $raw ): string {
	return is_string( $raw ) && isset( ideatoapps_blog_levels()[ $raw ] ) ? $raw : '';
}

/** The post's level slug, or '' when it has none or an unknown one. */
function ideatoapps_post_level( int $post_id ): string {
	return $post_id > 0 ? ideatoapps_blog_clean_level( get_post_meta( $post_id, 'ita_level', true ) ) : '';
}

/**
 * The post's known audiences (comma-separated meta), in stored order, without repeats, at most three: slug => label.
 *
 * @return array<string, string>
 */
function ideatoapps_post_audiences( int $post_id ): array {
	$raw    = $post_id > 0 ? get_post_meta( $post_id, 'ita_audiences', true ) : '';
	$labels = ideatoapps_blog_audience_labels();
	$out    = array();
	foreach ( is_string( $raw ) ? explode( ',', $raw ) : array() as $slug ) {
		if ( isset( $labels[ $slug ] ) && count( $out ) < 3 ) {
			$out[ $slug ] = $labels[ $slug ];
		}
	}
	return $out;
}

/**
 * Published posts per known level (levels with no post are left out), in level order.
 *
 * @return array<string, int>
 */
function ideatoapps_blog_level_counts(): array {
	global $wpdb;
	$rows = $wpdb->get_results( "SELECT m.meta_value AS level, COUNT(DISTINCT p.ID) AS n FROM {$wpdb->posts} p INNER JOIN {$wpdb->postmeta} m ON m.post_id = p.ID WHERE p.post_type = 'post' AND p.post_status = 'publish' AND m.meta_key = 'ita_level' GROUP BY m.meta_value", ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- one small grouped count.
	$have = array();
	foreach ( is_array( $rows ) ? $rows : array() as $row ) {
		$have[ (string) $row['level'] ] = (int) $row['n'];
	}
	$out = array();
	foreach ( array_keys( ideatoapps_blog_levels() ) as $level ) {
		if ( ! empty( $have[ $level ] ) ) {
			$out[ $level ] = $have[ $level ];
		}
	}
	return $out;
}
