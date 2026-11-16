<?php
/**
 * Starter-article installer state: the record of every slug ever installed (so a deleted post is not recreated silently) and
 * the one-run-at-a-time lock.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

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
