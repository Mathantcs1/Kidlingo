<?php
/**
 * Blog index (/blog/): request parsing (`cat`, `q`, `pg`), WP_Query args, the category list, URLs and the featured-post rule.
 * Odd input is ignored or capped, never an error: arrays and non-strings are dropped, an unknown category is ignored.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const IDEATOAPPS_BLOG_SEARCH_MAX   = 80;
const IDEATOAPPS_BLOG_FEATURED_MIN = 4;

/**
 * Categories that have at least one published post, with counts. The six topics come first in a fixed order, then the rest A to Z.
 * The default "Uncategorized" category is never listed.
 *
 * @return array<int, array{slug:string, name:string, count:int}>
 */
function ideatoapps_blog_categories(): array {
	$terms = get_terms(
		array(
			'taxonomy'   => 'category',
			'hide_empty' => true,
			'exclude'    => array( (int) get_option( 'default_category' ) ),
		)
	);
	if ( ! is_array( $terms ) ) {
		return array();
	}
	$order = array( 'ai-basics', 'prompting', 'llms', 'agents', 'work-and-learning', 'safety-and-judgment' );
	$rows  = array();
	foreach ( $terms as $term ) {
		if ( $term instanceof WP_Term && (int) $term->count > 0 ) {
			$rows[] = array( 'slug' => $term->slug, 'name' => $term->name, 'count' => (int) $term->count );
		}
	}
	$rank = static function ( string $slug ) use ( $order ): int {
		$at = array_search( $slug, $order, true );
		return false === $at ? count( $order ) : (int) $at;
	};
	usort(
		$rows,
		static fn( array $a, array $b ): int => $rank( $a['slug'] ) <=> $rank( $b['slug'] ) ?: strcasecmp( $a['name'], $b['name'] ) ?: strcmp( $a['slug'], $b['slug'] )
	);
	return $rows;
}

/**
 * A search text from user input: one line, no markup, single spaces, at most 80 characters (not bytes).
 */
function ideatoapps_blog_clean_search( string $raw ): string {
	$text = mb_substr( $raw, 0, 1000, 'UTF-8' ); // bound the work the regexes below do.
	$text = sanitize_text_field( $text ); // strips tags, bad UTF-8, line breaks and extra spaces.
	$text = trim( (string) preg_replace( '/\s+/u', ' ', $text ) );
	return trim( mb_substr( $text, 0, IDEATOAPPS_BLOG_SEARCH_MAX, 'UTF-8' ) );
}

/**
 * The blog request from a GET array (already unslashed): `cat` (an existing category slug that has posts), `q` and `pg`.
 *
 * @param array<string, mixed> $get Query parameters.
 * @return array{cat:string, q:string, pg:int}
 */
function ideatoapps_blog_request( array $get ): array {
	$q   = isset( $get['q'] ) && is_string( $get['q'] ) ? ideatoapps_blog_clean_search( $get['q'] ) : '';
	$cat = isset( $get['cat'] ) && is_string( $get['cat'] ) && '' !== $get['cat'] && strlen( $get['cat'] ) <= 200 ? $get['cat'] : '';
	if ( '' !== $cat && ! in_array( $cat, array_column( ideatoapps_blog_categories(), 'slug' ), true ) ) {
		$cat = '';
	}
	$pg = $get['pg'] ?? 1;
	$pg = is_int( $pg ) ? $pg : ( is_string( $pg ) && 1 === preg_match( '/\A[0-9]{1,6}\z/', $pg ) ? (int) $pg : 1 );
	return array( 'cat' => $cat, 'q' => $q, 'pg' => max( 1, $pg ) );
}

/**
 * WP_Query args for the blog list: newest first (ID tiebreak), the page from `pg`, plus `s` and `category_name` when set.
 *
 * @param array<string, mixed> $get Query parameters (already unslashed).
 * @return array<string, mixed>
 */
function ideatoapps_blog_query_args( array $get ): array {
	$req  = ideatoapps_blog_request( $get );
	$args = array(
		'post_type'           => 'post',
		'post_status'         => 'publish',
		'posts_per_page'      => IDEATOAPPS_BLOG_PER_PAGE,
		'paged'               => $req['pg'],
		'ignore_sticky_posts' => true,
		'orderby'             => array( 'date' => 'DESC', 'ID' => 'DESC' ),
	);
	if ( '' !== $req['q'] ) {
		$args['s'] = $req['q'];
	}
	if ( '' !== $req['cat'] ) {
		$args['category_name'] = $req['cat'];
	}
	return $args;
}

/**
 * Whether a category or a search is active.
 *
 * @param array{cat:string, q:string, pg:int} $req Request.
 */
function ideatoapps_blog_is_filtered( array $req ): bool {
	return '' !== $req['cat'] || '' !== $req['q'];
}

/**
 * The newest post is shown as a large card on page 1 with no filters, when there are enough posts for a grid to remain.
 *
 * @param array{cat:string, q:string, pg:int} $req   Request.
 * @param int                                 $found Posts that match.
 */
function ideatoapps_blog_has_featured( array $req, int $found ): bool {
	return ! ideatoapps_blog_is_filtered( $req ) && 1 === $req['pg'] && $found >= IDEATOAPPS_BLOG_FEATURED_MIN;
}

/**
 * The blog page URL (the page with slug `blog`, or /blog/).
 */
function ideatoapps_blog_base_url(): string {
	$page = get_page_by_path( 'blog' );
	return $page instanceof WP_Post ? (string) get_permalink( $page ) : home_url( '/blog/' );
}

/**
 * A blog URL that keeps the filters (urlencoded). Page 1 has no `pg`.
 *
 * @param array{cat:string, q:string, pg?:int} $req  Request (only cat and q are used).
 * @param int                                  $page Page number.
 * @param string                               $base Blog page URL; defaults to the blog page.
 */
function ideatoapps_blog_url( array $req, int $page = 1, string $base = '' ): string {
	$query = array();
	if ( ! empty( $req['cat'] ) ) {
		$query['cat'] = rawurlencode( (string) $req['cat'] );
	}
	if ( ! empty( $req['q'] ) ) {
		$query['q'] = rawurlencode( (string) $req['q'] );
	}
	if ( $page > 1 ) {
		$query['pg'] = (string) $page;
	}
	return add_query_arg( $query, '' !== $base ? $base : ideatoapps_blog_base_url() );
}

/**
 * Card args for a blog post (shared by the grid and the featured card).
 *
 * @return array<string, mixed>
 */
function ideatoapps_blog_card_args( WP_Post $post, int $words = 28 ): array {
	$label = '';
	foreach ( get_the_category( $post->ID ) as $term ) {
		if ( (int) $term->term_id !== (int) get_option( 'default_category' ) ) {
			$label = $term->name;
			break;
		}
	}
	return array(
		'title'     => get_the_title( $post ),
		'href'      => get_permalink( $post ),
		'label'     => $label,
		'eyebrow'   => get_the_date( '', $post ),
		'text'      => wp_trim_words( wp_strip_all_tags( get_the_excerpt( $post ) ), $words ),
		/* translators: %d: minutes to read. */
		'meta'      => sprintf( __( '%d min read', 'ideatoapps' ), ideatoapps_reading_minutes( $post->ID ) ),
		'image_id'  => (int) get_post_thumbnail_id( $post ),
		'hero_html' => ideatoapps_card_hero( $post ),
		'heading'   => 2,
	);
}
