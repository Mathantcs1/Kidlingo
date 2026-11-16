<?php
/**
 * Post meta the starter-article installer writes: all of it on a new draft, and only the missing level/audience meta on a
 * starter post that already exists (posts installed before levels existed). All keys are protected meta (blog-review.php).
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Meta of a freshly created starter draft.
 *
 * @param array<string,mixed> $article Parsed article.
 */
function ideatoapps_blog_write_meta( int $id, array $article ): void {
	$meta = array(
		'ita_starter_slug'  => (string) $article['slug'],
		'ita_starter_hash'  => hash( 'sha256', (string) get_post_field( 'post_content', $id ) ),
		'ita_drafted_on'    => $article['reviewed'],
		'ita_gated'         => $article['gated'] ? 1 : 0,
		'ita_check'         => (string) wp_json_encode( $article['check'] ),
		'ita_review_status' => 'ai_draft',
	) + ideatoapps_blog_level_meta( $article );
	foreach ( $meta as $key => $value ) {
		update_post_meta( $id, $key, is_string( $value ) ? wp_slash( $value ) : $value );
	}
}

/**
 * Reader level meta of an article: ita_level (slug) and ita_audiences (comma-separated slugs).
 *
 * @param array<string,mixed> $article Parsed article.
 * @return array<string,string>
 */
function ideatoapps_blog_level_meta( array $article ): array {
	return array(
		'ita_level'     => (string) $article['level'],
		'ita_audiences' => implode( ',', (array) $article['audiences'] ),
	);
}

/**
 * Add the level meta to an existing starter post when it is missing. An existing value (even an edited one) is kept, and the
 * post itself (content, status, dates) is never touched. Only posts that still carry the starter slug are filled in.
 *
 * @param array<string,mixed> $article Parsed article.
 */
function ideatoapps_blog_backfill_meta( int $id, array $article ): void {
	if ( (string) get_post_meta( $id, 'ita_starter_slug', true ) !== (string) $article['slug'] ) {
		return;
	}
	foreach ( ideatoapps_blog_level_meta( $article ) as $key => $value ) {
		if ( ! metadata_exists( 'post', $id, $key ) ) {
			add_post_meta( $id, $key, wp_slash( $value ), true );
		}
	}
}
