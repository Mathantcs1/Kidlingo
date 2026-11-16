<?php
/**
 * Blog index (/blog/): request parsing (`cat`, `level`, `q`, `pg`), WP_Query args, the category list, URLs and the featured-post rule.
 * Odd input is ignored or capped, never an error: arrays and non-strings are dropped, an unknown category or level is ignored.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const IDEATOAPPS_BLOG_SEARCH_MAX   = 80;
const IDEATOAPPS_BLOG_FEATURED_MIN = 4;

/**
 * The six topic slugs in their fixed order.
 *
 * @return string[]
 */
function ideatoapps_blog_topics(): array {
	return array( 'ai-basics', 'prompting', 'llms', 'agents', 'work-and-learning', 'safety-and-judgment' );
}

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
	$order = ideatoapps_blog_topics();
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
 * Whether WordPress would search for at least one real word in this text. Stopwords ("what", "the") and single letters are dropped
 * by WP_Query; when nothing is left it falls back to matching the whole text as a phrase, which for "a" is nearly every post.
 * Such a search finds nothing here instead. Uses WP_Query's own term parser, so the rules stay the same as core's.
 */
function ideatoapps_blog_search_usable( string $q ): bool {
	if ( ! preg_match_all( '/".*?("|$)|((?<=[\t ",+])|^)[^\t ",+]+/', $q, $found ) ) {
		return false;
	}
	$parser = new class() extends WP_Query {
		/**
		 * @param string[] $terms Raw terms.
		 * @return string[]
		 */
		public function useful( array $terms ): array {
			return $this->parse_search_terms( $terms );
		}
	};
	foreach ( $parser->useful( $found[0] ) as $term ) {
		if ( 1 === preg_match( '/[\p{L}\p{N}]/u', (string) $term ) ) {
			return true;
		}
	}
	return false;
}

/**
 * The blog request from a GET array (already unslashed): `cat` (an existing category slug that has posts), `level` (one of the three
 * levels, exactly), `q` and `pg`.
 *
 * @param array<string, mixed> $get Query parameters.
 * @return array{cat:string, level:string, q:string, pg:int}
 */
function ideatoapps_blog_request( array $get ): array {
	$q   = isset( $get['q'] ) && is_string( $get['q'] ) ? ideatoapps_blog_clean_search( $get['q'] ) : '';
	$cat = isset( $get['cat'] ) && is_string( $get['cat'] ) && '' !== $get['cat'] && strlen( $get['cat'] ) <= 200 ? $get['cat'] : '';
	if ( '' !== $cat && ! in_array( $cat, array_column( ideatoapps_blog_categories(), 'slug' ), true ) ) {
		$cat = '';
	}
	$pg = $get['pg'] ?? 1;
	$pg = is_int( $pg ) ? $pg : ( is_string( $pg ) && 1 === preg_match( '/\A[0-9]{1,6}\z/', $pg ) ? (int) $pg : 1 );
	return array( 'cat' => $cat, 'level' => ideatoapps_blog_clean_level( $get['level'] ?? '' ), 'q' => $q, 'pg' => max( 1, $pg ) );
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
		if ( ! ideatoapps_blog_search_usable( $req['q'] ) ) {
			$args['post__in'] = array( 0 ); // nothing to search for: no results, not "everything".
		}
	}
	if ( '' !== $req['cat'] ) {
		$args['category_name'] = $req['cat'];
	}
	if ( '' !== $req['level'] ) {
		$args['meta_query'] = array( array( 'key' => 'ita_level', 'value' => $req['level'] ) ); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- a filtered list of at most a few hundred posts.
	}
	return $args;
}

/**
 * Whether a category, a level or a search is active.
 *
 * @param array{cat:string, level?:string, q:string, pg:int} $req Request.
 */
function ideatoapps_blog_is_filtered( array $req ): bool {
	return '' !== $req['cat'] || '' !== $req['q'] || '' !== ( $req['level'] ?? '' );
}

/**
 * The newest post is shown as a large card on page 1 with no filters, when there are enough posts for a grid to remain.
 *
 * @param array{cat:string, level?:string, q:string, pg:int} $req   Request.
 * @param int                                                $found Posts that match.
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
 * A blog URL that keeps the filters (urlencoded; a level only when it is a known one). Page 1 has no `pg`.
 *
 * @param array{cat:string, level?:string, q:string, pg?:int} $req Request (only cat, level and q are used).
 * @param int                                  $page Page number.
 * @param string                               $base Blog page URL; defaults to the blog page.
 */
function ideatoapps_blog_url( array $req, int $page = 1, string $base = '' ): string {
	$query = array();
	if ( ! empty( $req['cat'] ) ) {
		$query['cat'] = rawurlencode( (string) $req['cat'] );
	}
	if ( '' !== ideatoapps_blog_clean_level( $req['level'] ?? '' ) ) {
		$query['level'] = $req['level'];
	}
	if ( ! empty( $req['q'] ) ) {
		$query['q'] = rawurlencode( (string) $req['q'] );
	}
	if ( $page > 1 ) {
		$query['pg'] = (string) $page;
	}
	return add_query_arg( $query, '' !== $base ? $base : ideatoapps_blog_base_url() );
}
