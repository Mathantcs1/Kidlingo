<?php
/**
 * Data and routing helpers for the content pages (Learn, Blog, About, Contact, FAQ, legal).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const IDEATOAPPS_BLOG_PER_PAGE = 9;

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
			'a' => __( 'ClipForge is a one-time purchase of $24.99 USD. There is no free trial.', 'ideatoapps' ),
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
	return isset( $_GET['pg'] ) ? max( 1, absint( wp_unslash( $_GET['pg'] ) ) ) : 1;
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
