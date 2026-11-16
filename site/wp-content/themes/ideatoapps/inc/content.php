<?php
/**
 * Data and routing helpers for the content pages (Learn, Blog, About, Contact, FAQ, legal).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const IDEATOAPPS_BLOG_PER_PAGE = 12;

/**
 * Slugs of the draft legal pages.
 *
 * @return string[]
 */
function ideatoapps_legal_slugs(): array {
	return array( 'privacy', 'terms', 'refund-policy' );
}

function ideatoapps_is_legal_slug( string $slug ): bool {
	return in_array( $slug, ideatoapps_legal_slugs(), true );
}

/**
 * Whether the contact form has been switched on by the owner (the plugin owns the option).
 */
function ideatoapps_contact_available(): bool {
	return function_exists( 'ideatoapps_contact_enabled' ) && ideatoapps_contact_enabled();
}

/**
 * Questions and answers for /faq/. Only facts the ClipForge README backs: no browser, OS, library or refund claims beyond them.
 *
 * @return array<int, array{q:string, a:string}>
 */
function ideatoapps_faq_items(): array {
	return array(
		array(
			'q' => __( 'What is ClipForge?', 'ideatoapps' ),
			'a' => __( 'ClipForge is a video editor that runs in your browser. You import clips, arrange, trim and split them on a timeline, preview the result and export an MP4.', 'ideatoapps' ),
		),
		array(
			'q' => __( 'What does it cost?', 'ideatoapps' ),
			/* translators: %s: price with currency, from the ClipForge product, such as "$24.99 USD". */
			'a' => sprintf( __( 'ClipForge is a one-time purchase of %s. There is no free trial.', 'ideatoapps' ), ideatoapps_clipforge_price_text() ),
		),
		array(
			'q' => __( 'Is my video uploaded anywhere?', 'ideatoapps' ),
			'a' => __( 'No. Decoding, rendering and encoding all happen on your own computer, and your media never leaves it.', 'ideatoapps' ),
		),
		array(
			'q' => __( 'Which browser should I use?', 'ideatoapps' ),
			'a' => __( 'ClipForge is tested in desktop Chrome. Safari is untested.', 'ideatoapps' ),
		),
		array(
			'q' => __( 'How do I run it after buying?', 'ideatoapps' ),
			'a' => __( 'ClipForge runs locally after you unzip the download. It needs Python 3 or Node.js to start the small local server it is served from.', 'ideatoapps' ),
		),
	);
}

/**
 * Pages that use the shared content stylesheet.
 */
function ideatoapps_is_content_view(): bool {
	if ( is_front_page() || is_singular( 'app' ) || ( function_exists( 'ideatoapps_is_catalog' ) && ideatoapps_is_catalog() ) ) {
		return false;
	}
	return true;
}

/**
 * Whether the page can show a JSON form (newsletter or contact).
 */
function ideatoapps_has_json_form(): bool {
	return is_front_page() || is_post_type_archive( 'video' ) || is_page( array( 'blog', 'contact' ) );
}

/**
 * Current page number for the blog page (plain `?pg=` so it works with any permalink setting).
 */
function ideatoapps_blog_page_number(): int {
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only page number.
	return ideatoapps_blog_request( wp_unslash( $_GET ) )['pg'];
}

/**
 * Blog only (`/blog/?pg=99`): where to send a visitor who asked for a page past the end, the last page that exists, so
 * they never see an empty state that claims there is nothing. (The apps catalog needs none: WordPress core already
 * answers 404 for a catalog page past the end.) 0 means the request is fine as it is.
 *
 * @param int $page      Requested page (1-based).
 * @param int $max_pages Pages the list really has (0 when it is empty).
 */
function ideatoapps_overflow_target_page( int $page, int $max_pages ): int {
	return $page > 1 && $page > max( 1, $max_pages ) ? max( 1, $max_pages ) : 0;
}

/**
 * How many pages a list really has. WordPress skips the total when the requested page is already past the end, so
 * count again from page 1 (ids only) before deciding where an out-of-range request should go.
 *
 * @param array<string, mixed> $args WP_Query args of the list (any `paged` is ignored).
 */
function ideatoapps_list_page_count( array $args ): int {
	$count = new WP_Query( array_merge( $args, array( 'paged' => 1, 'fields' => 'ids', 'no_found_rows' => false ) ) );
	return (int) $count->max_num_pages;
}

/**
 * The visible app a video is about, or null.
 */
function ideatoapps_video_related_app( int $video_id ): ?WP_Post {
	$app_id = (int) get_post_meta( $video_id, 'related_app_id', true );
	$app    = $app_id > 0 ? get_post( $app_id ) : null;
	return $app instanceof WP_Post && 'app' === $app->post_type && ideatoapps_app_is_visible( $app ) ? $app : null;
}

// Learn archive: newest first, 12 per page.
add_action(
	'pre_get_posts',
	static function ( WP_Query $query ): void {
		if ( ! is_admin() && $query->is_main_query() && $query->is_post_type_archive( 'video' ) ) {
			$query->set( 'posts_per_page', 12 );
			$query->set( 'orderby', array( 'date' => 'DESC', 'ID' => 'DESC' ) );
		}
	}
);
