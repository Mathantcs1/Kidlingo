<?php
/**
 * Starter article files: content/articles/NN-slug.html. The file starts with one HTML comment holding a JSON header, then the post body:
 *
 *   <!--ita {"slug":"01-what-ai-is-and-isnt","title":"...","category":"ai-basics","excerpt":"...","reviewed":"2026-11-16","gated":false,"check":["claim 1","claim 2","claim 3"]} -->
 *
 * `reviewed` is the date the DRAFT was written. It is stored as ita_drafted_on and is never a human review date.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

const IDEATOAPPS_ARTICLE_SLUG_RE = '/\A\d\d-[a-z0-9]+(?:-[a-z0-9]+)*\z/';

/**
 * The 50 topics (content/topics.json): slug, title, category (slug) and categoryLabel.
 *
 * @return array<int, array<string, string>>
 */
function ideatoapps_blog_topic_list(): array {
	static $topics = null;
	if ( null === $topics ) {
		$data   = json_decode( (string) @file_get_contents( IDEATOAPPS_CORE_DIR . 'content/topics.json' ), true ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- a missing file means no topics, not a notice.
		$topics = array_values( array_filter( is_array( $data ) ? $data : array(), 'is_array' ) );
	}
	return $topics;
}

/**
 * Folder holding the article files. Filterable so tests can point at fixtures.
 */
function ideatoapps_blog_articles_dir(): string {
	$dir = apply_filters( 'ideatoapps_blog_articles_dir', IDEATOAPPS_CORE_DIR . 'content/articles' );
	return is_string( $dir ) ? rtrim( $dir, '/\\' ) : '';
}

/**
 * Paths of the article files (NN-slug.html), sorted by name.
 *
 * @return string[]
 */
function ideatoapps_blog_article_files(): array {
	$dir   = ideatoapps_blog_articles_dir();
	$files = array();
	foreach ( ( '' !== $dir && is_dir( $dir ) ? scandir( $dir ) : false ) ?: array() as $name ) {
		if ( 1 === preg_match( '/\A\d\d-[a-z0-9]+(?:-[a-z0-9]+)*\.html\z/', $name ) ) {
			$files[] = $dir . '/' . $name;
		}
	}
	sort( $files, SORT_STRING );
	return $files;
}

/**
 * Valid YYYY-MM-DD (a real calendar date).
 *
 * @param mixed $value Raw value.
 */
function ideatoapps_blog_valid_date( $value ): bool {
	return is_string( $value ) && 1 === preg_match( '/\A(\d{4})-(\d{2})-(\d{2})\z/', $value, $m ) && checkdate( (int) $m[2], (int) $m[3], (int) $m[1] );
}

/**
 * Parse one article file. Never throws and never emits a notice.
 *
 * @param string $path File path.
 * @return array{slug:string,title:string,category:string,excerpt:string,reviewed:string,gated:bool,check:string[],body:string}|WP_Error
 */
function ideatoapps_blog_parse_article( string $path ) {
	$bad = static fn( string $why ): WP_Error => new WP_Error( 'ideatoapps_article', $why );
	if ( ! is_file( $path ) || ! is_readable( $path ) || filesize( $path ) > 400000 ) {
		return $bad( 'Article file missing, unreadable or too large.' );
	}
	$raw = file_get_contents( $path );
	if ( ! is_string( $raw ) || 1 !== preg_match( '/\A(?:\xEF\xBB\xBF)?\s*<!--ita\s+(\{.*?\})\s*-->/s', $raw, $m ) ) {
		return $bad( 'Header comment <!--ita {...} --> not found at the start of the file.' );
	}
	$h = json_decode( $m[1], true );
	if ( ! is_array( $h ) ) {
		return $bad( 'Header is not valid JSON.' );
	}
	$text = static fn( $v, int $max ): string => is_string( $v ) ? mb_substr( trim( sanitize_text_field( $v ) ), 0, $max ) : '';

	$slug = isset( $h['slug'] ) && is_string( $h['slug'] ) ? $h['slug'] : '';
	if ( 1 !== preg_match( IDEATOAPPS_ARTICLE_SLUG_RE, $slug ) || basename( $path ) !== $slug . '.html' ) {
		return $bad( 'Slug must look like 01-some-words and match the file name.' );
	}
	$topic = null;
	foreach ( ideatoapps_blog_topic_list() as $t ) {
		if ( ( $t['slug'] ?? '' ) === $slug ) {
			$topic = $t;
		}
	}
	if ( null === $topic ) {
		return $bad( 'Slug is not in topics.json.' );
	}
	$title = $text( $h['title'] ?? null, 200 );
	if ( '' === $title || $title !== (string) ( $topic['title'] ?? '' ) ) {
		return $bad( 'Title must match the topic title in topics.json.' );
	}
	$cats = array_unique( array_column( ideatoapps_blog_topic_list(), 'category' ) );
	if ( ! isset( $h['category'] ) || ! is_string( $h['category'] ) || ! in_array( $h['category'], $cats, true ) || $h['category'] !== ( $topic['category'] ?? '' ) ) {
		return $bad( 'Category is not the topic category from topics.json.' );
	}
	$excerpt = is_string( $h['excerpt'] ?? null ) ? trim( sanitize_text_field( $h['excerpt'] ) ) : '';
	if ( '' === $excerpt || mb_strlen( $excerpt ) > 160 ) {
		return $bad( 'Excerpt must be 1 to 160 characters.' );
	}
	if ( ! ideatoapps_blog_valid_date( $h['reviewed'] ?? null ) ) {
		return $bad( '"reviewed" (the draft date) must be a real YYYY-MM-DD date.' );
	}
	$check = array();
	foreach ( is_array( $h['check'] ?? null ) ? $h['check'] : array() as $item ) {
		$item = $text( $item, 300 );
		if ( '' !== $item ) {
			$check[] = $item;
		}
	}
	if ( ! is_array( $h['check'] ?? null ) || count( $check ) !== count( $h['check'] ) || count( $check ) < 3 || count( $check ) > 6 ) {
		return $bad( '"check" needs 3 to 6 non-empty strings.' );
	}
	$gated = $h['gated'] ?? false;
	if ( ! is_bool( $gated ) && 0 !== $gated && 1 !== $gated ) {
		return $bad( '"gated" must be true or false.' );
	}
	$body = trim( substr( $raw, strlen( $m[0] ) + (int) strpos( $raw, $m[0] ) ) );
	if ( '' === $body ) {
		return $bad( 'The article body is empty.' );
	}
	return array(
		'slug'     => $slug,
		'title'    => $title,
		'category' => $h['category'],
		'excerpt'  => $excerpt,
		'reviewed' => $h['reviewed'],
		'gated'    => (bool) $gated,
		'check'    => $check,
		'body'     => $body,
	);
}
