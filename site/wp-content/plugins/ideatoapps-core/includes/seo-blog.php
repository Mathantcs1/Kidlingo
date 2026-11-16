<?php
/**
 * Title and meta description of a blog category view (/blog/?cat=slug): one per category, plain facts only.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * The category term of the current blog view, or null (no category, unknown category, or not the blog).
 */
function ideatoapps_seo_blog_category(): ?WP_Term {
	$cat  = ideatoapps_seo_blog_filters()['cat'];
	$term = '' !== $cat ? get_term_by( 'slug', $cat, 'category' ) : false;
	return $term instanceof WP_Term ? $term : null;
}

/**
 * "{Category} articles" for a category view; any other title is returned unchanged.
 */
function ideatoapps_seo_blog_category_title( string $title ): string {
	$term = ideatoapps_seo_blog_category();
	/* translators: %s: blog category name. */
	return null === $term ? $title : sprintf( __( '%s articles', 'ideatoapps-core' ), $term->name );
}

/**
 * The category's own description when it has one, else a generic sentence with its name; any other text is returned unchanged.
 */
function ideatoapps_seo_blog_category_description( string $text ): string {
	$term = ideatoapps_seo_blog_category();
	if ( null === $term ) {
		return $text;
	}
	$own = ideatoapps_seo_trim( (string) $term->description );
	/* translators: %s: blog category name. */
	return '' !== $own ? $own : sprintf( __( 'Articles about %s from IdeaToApps.', 'ideatoapps-core' ), $term->name );
}
