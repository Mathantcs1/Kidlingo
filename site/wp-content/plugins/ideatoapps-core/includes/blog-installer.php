<?php
/**
 * Starter-article installer: creates the article files as DRAFT posts. Idempotent; never publishes, never deletes, never touches a
 * post that already exists (any status, trash included).
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Id of the post made from a starter article, in any status (trash included), or 0.
 */
function ideatoapps_blog_find_starter( string $slug ): int {
	global $wpdb;
	return (int) $wpdb->get_var( $wpdb->prepare( "SELECT p.ID FROM {$wpdb->posts} p INNER JOIN {$wpdb->postmeta} m ON m.post_id = p.ID WHERE p.post_type = 'post' AND m.meta_key = 'ita_starter_slug' AND m.meta_value = %s ORDER BY p.ID ASC LIMIT 1", $slug ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- must see every status.
}

/**
 * Term id of a topic category; created with the topic's label when missing, an existing one is never renamed.
 */
function ideatoapps_blog_ensure_category( string $slug ): int {
	$term = get_term_by( 'slug', $slug, 'category' );
	if ( $term instanceof WP_Term ) {
		return (int) $term->term_id;
	}
	foreach ( ideatoapps_blog_topic_list() as $t ) {
		if ( ( $t['category'] ?? '' ) === $slug ) {
			$made = wp_insert_term( (string) $t['categoryLabel'], 'category', array( 'slug' => $slug ) );
			return is_wp_error( $made ) ? 0 : (int) $made['term_id'];
		}
	}
	return 0;
}

/**
 * Create the missing starter posts as drafts.
 *
 * @return array{created:int,skipped:int,errors:int}
 */
function ideatoapps_blog_install(): array {
	$out = array( 'created' => 0, 'skipped' => 0, 'errors' => 0 );
	foreach ( ideatoapps_blog_article_files() as $path ) {
		$article = ideatoapps_blog_parse_article( $path );
		if ( is_wp_error( $article ) ) {
			++$out['errors'];
			continue;
		}
		if ( ideatoapps_blog_find_starter( $article['slug'] ) > 0 ) {
			++$out['skipped'];
			continue;
		}
		$cat = ideatoapps_blog_ensure_category( $article['category'] );
		if ( $cat <= 0 ) {
			++$out['errors'];
			continue;
		}
		$id = wp_insert_post(
			wp_slash(
				array(
					'post_type'     => 'post',
					'post_status'   => 'draft',
					'post_title'    => $article['title'],
					'post_excerpt'  => $article['excerpt'],
					'post_name'     => preg_replace( '/\A\d\d-/', '', $article['slug'] ),
					'post_content'  => $article['body'],
					'post_author'   => get_current_user_id(),
					'post_category' => array( $cat ),
				)
			),
			true
		);
		if ( is_wp_error( $id ) || ! $id ) {
			++$out['errors'];
			continue;
		}
		$meta = array(
			'ita_starter_slug'  => $article['slug'],
			'ita_starter_hash'  => ideatoapps_review_hash( (string) get_post_field( 'post_content', $id ) ),
			'ita_drafted_on'    => $article['reviewed'],
			'ita_gated'         => $article['gated'] ? 1 : 0,
			'ita_check'         => (string) wp_json_encode( $article['check'] ),
			'ita_review_status' => 'ai_draft',
		);
		foreach ( $meta as $key => $value ) {
			update_post_meta( $id, $key, is_string( $value ) ? wp_slash( $value ) : $value );
		}
		++$out['created'];
	}
	return $out;
}

/**
 * How many article files exist and how many already have a post.
 *
 * @return array{total:int,installed:int}
 */
function ideatoapps_blog_install_status(): array {
	$files = ideatoapps_blog_article_files();
	$have  = 0;
	foreach ( $files as $path ) {
		$have += ideatoapps_blog_find_starter( basename( $path, '.html' ) ) > 0 ? 1 : 0;
	}
	return array( 'total' => count( $files ), 'installed' => $have );
}
