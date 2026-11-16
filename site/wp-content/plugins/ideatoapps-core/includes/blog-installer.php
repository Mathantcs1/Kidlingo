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
 * The existing post (any status, trash included) for a starter slug: found by its meta, or by the id the installer recorded, or 0.
 */
function ideatoapps_blog_post_for_slug( string $slug ): int {
	$id = ideatoapps_blog_find_starter( $slug );
	if ( $id > 0 ) {
		return $id;
	}
	$rec = (int) ( ideatoapps_blog_installed_slugs()[ $slug ] ?? 0 );
	return $rec > 0 && get_post( $rec ) instanceof WP_Post && '' !== (string) get_post_meta( $rec, 'ita_starter_hash', true ) ? $rec : 0;
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

/** Slug => post id of every starter post this site has ever created (kept after the post is deleted). */
function ideatoapps_blog_installed_slugs(): array {
	$v = get_option( 'ideatoapps_blog_installed_slugs', array() );
	return is_array( $v ) ? $v : array();
}

function ideatoapps_blog_record_slug( string $slug, int $post_id ): void {
	$all          = ideatoapps_blog_installed_slugs();
	$all[ $slug ] = $post_id;
	update_option( 'ideatoapps_blog_installed_slugs', $all, false );
}

/**
 * Take the install lock: one run at a time. The option holds "time:token"; add_option() is atomic, so of two simultaneous runs only one
 * wins. A lock older than 60 seconds is treated as stale (a crashed run) and taken over; two runs that both see the same stale lock can
 * still overlap, which is harmless because each article is also guarded by the post/slug record. A run releases only a lock that still
 * carries its own token, so a slow run never frees a lock that someone else took over.
 *
 * @return string Token, or '' when another run holds the lock.
 */
function ideatoapps_blog_lock(): string {
	$token = wp_generate_password( 12, false );
	if ( add_option( 'ideatoapps_blog_install_lock', time() . ':' . $token, '', false ) ) {
		return $token;
	}
	$held = (string) get_option( 'ideatoapps_blog_install_lock', '' );
	if ( time() - (int) $held > 60 ) {
		update_option( 'ideatoapps_blog_install_lock', time() . ':' . $token, false );
		return $token;
	}
	return '';
}

/** Release the lock if it is still ours. */
function ideatoapps_blog_unlock( string $token ): void {
	if ( '' !== $token && substr( (string) get_option( 'ideatoapps_blog_install_lock', '' ), -strlen( $token ) ) === $token ) {
		delete_option( 'ideatoapps_blog_install_lock' );
	}
}

/**
 * Create one article as a draft unless it is already there or was ever installed.
 *
 * @param array<string,mixed> $article Parsed article.
 * @return string created, skipped or error.
 */
function ideatoapps_blog_install_one( array $article ): string {
	$slug = (string) $article['slug'];
	$have = ideatoapps_blog_find_starter( $slug );
	if ( $have > 0 ) {
		ideatoapps_blog_record_slug( $slug, $have );
		return 'skipped';
	}
	if ( isset( ideatoapps_blog_installed_slugs()[ $slug ] ) ) {
		return 'skipped'; // Deleted on purpose: only the "Reinstall" action brings it back.
	}
	$cat = ideatoapps_blog_ensure_category( $article['category'] );
	if ( $cat <= 0 ) {
		return 'error';
	}
	$id = wp_insert_post(
		wp_slash(
			array(
				'post_type'     => 'post',
				'post_status'   => 'draft',
				'post_title'    => $article['title'],
				'post_excerpt'  => $article['excerpt'],
				'post_name'     => preg_replace( '/\A\d\d-/', '', $slug ),
				'post_content'  => $article['body'],
				'post_author'   => get_current_user_id(),
				'post_category' => array( $cat ),
			)
		),
		true
	);
	if ( is_wp_error( $id ) || ! $id ) {
		return 'error';
	}
	$meta = array(
		'ita_starter_slug'  => $slug,
		'ita_starter_hash'  => hash( 'sha256', (string) get_post_field( 'post_content', $id ) ),
		'ita_drafted_on'    => $article['reviewed'],
		'ita_gated'         => $article['gated'] ? 1 : 0,
		'ita_check'         => (string) wp_json_encode( $article['check'] ),
		'ita_review_status' => 'ai_draft',
		'ita_level'         => $article['level'],
		'ita_audiences'     => implode( ',', $article['audiences'] ),
	);
	foreach ( $meta as $key => $value ) {
		update_post_meta( $id, $key, is_string( $value ) ? wp_slash( $value ) : $value );
	}
	ideatoapps_blog_record_slug( $slug, (int) $id );
	return 'created';
}

/**
 * Create the missing starter posts as drafts. A second run while one is in progress creates nothing (`locked`).
 *
 * @return array{created:int,skipped:int,errors:int,locked:bool}
 */
function ideatoapps_blog_install( ?string $only = null ): array {
	$out = array( 'created' => 0, 'skipped' => 0, 'errors' => 0, 'locked' => false );
	$token = ideatoapps_blog_lock();
	if ( '' === $token ) {
		$out['locked'] = true;
		return $out;
	}
	try {
		foreach ( ideatoapps_blog_article_files() as $path ) {
			if ( null !== $only && basename( $path, '.html' ) !== $only ) {
				continue;
			}
			$article = ideatoapps_blog_parse_article( $path );
			$r       = is_wp_error( $article ) ? 'error' : ideatoapps_blog_install_one( $article );
			++$out[ 'error' === $r ? 'errors' : $r ];
		}
	} finally {
		ideatoapps_blog_unlock( $token );
	}
	return $out;
}

/**
 * Recorded slugs whose post no longer exists (permanently deleted) and whose article file is still there.
 *
 * @return string[]
 */
function ideatoapps_blog_missing_slugs(): array {
	$files = array_map( static fn( $p ) => basename( $p, '.html' ), ideatoapps_blog_article_files() );
	$out   = array();
	foreach ( ideatoapps_blog_installed_slugs() as $slug => $post_id ) {
		// Deleted only when the recorded post is really gone (any status, trash included, counts as there) and no post carries the slug.
		if ( in_array( $slug, $files, true ) && 0 === ideatoapps_blog_post_for_slug( (string) $slug ) ) {
			$out[] = (string) $slug;
		}
	}
	return $out;
}

/**
 * Explicitly recreate one deleted starter article as a fresh draft.
 *
 * @return array{created:int,skipped:int,errors:int,locked:bool}
 */
function ideatoapps_blog_reinstall( string $slug ): array {
	if ( ! in_array( $slug, ideatoapps_blog_missing_slugs(), true ) ) {
		return array( 'created' => 0, 'skipped' => 1, 'errors' => 0, 'locked' => false );
	}
	$all = ideatoapps_blog_installed_slugs();
	unset( $all[ $slug ] );
	update_option( 'ideatoapps_blog_installed_slugs', $all, false );
	$r = ideatoapps_blog_install( $slug );
	if ( 0 === $r['created'] && ! $r['locked'] ) { // Nothing came back (file error): keep the record so it is not silently recreated later.
		ideatoapps_blog_record_slug( $slug, 0 );
	}
	if ( $r['locked'] ) {
		ideatoapps_blog_record_slug( $slug, 0 );
	}
	return $r;
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
		$have += ideatoapps_blog_post_for_slug( basename( $path, '.html' ) ) > 0 ? 1 : 0;
	}
	return array( 'total' => count( $files ), 'installed' => $have );
}

// A permanently deleted starter post: keep the slug (so it is not recreated silently) but forget the id, which the database may hand to
// an unrelated post later (import, merge).
add_action(
	'deleted_post',
	static function ( $post_id ): void {
		$all  = ideatoapps_blog_installed_slugs();
		$hit  = false;
		foreach ( $all as $slug => $id ) {
			if ( (int) $id === (int) $post_id ) {
				$all[ $slug ] = 0;
				$hit          = true;
			}
		}
		if ( $hit ) {
			update_option( 'ideatoapps_blog_installed_slugs', $all, false );
		}
	}
);
