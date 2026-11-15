<?php
/**
 * robots.txt (virtual) and the XML sitemap: /sitemap.xml is rewritten to core's /wp-sitemap.xml, which lists only public,
 * indexable content (live and coming-soon apps, real pages, posts, videos) and nothing that is noindex or an empty module.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Build robots.txt: keep what WordPress and WooCommerce already disallow, add the private areas, point at the sitemap.
 * Left untouched when the owner discourages search engines (then the output is "Disallow: /").
 *
 * @param string     $output Core output.
 * @param string|int $public Value of blog_public.
 */
function ideatoapps_robots_txt( $output, $public ) {
	if ( ! ideatoapps_seo_enabled() || ! (int) $public ) {
		return $output;
	}
	$lines = array();
	foreach ( preg_split( '/\r\n|\r|\n/', (string) $output ) as $line ) {
		if ( '' !== trim( $line ) && 0 !== stripos( $line, 'Sitemap:' ) ) {
			$lines[] = $line;
		}
	}
	if ( ! $lines || 0 !== stripos( $lines[0], 'User-agent:' ) ) {
		array_unshift( $lines, 'User-agent: *' );
	}
	foreach ( array( 'Disallow: /wp-admin/', 'Allow: /wp-admin/admin-ajax.php', 'Disallow: /my-account/', 'Disallow: /cart/', 'Disallow: /checkout/' ) as $rule ) {
		if ( ! in_array( $rule, $lines, true ) ) {
			$lines[] = $rule;
		}
	}
	return implode( "\n", $lines ) . "\n\nSitemap: " . ideatoapps_canonical_origin() . "/sitemap.xml\n";
}
add_filter( 'robots_txt', 'ideatoapps_robots_txt', 99, 2 );

/**
 * Register the /sitemap.xml rule (also called by the tests after they reset the rewrite rules).
 */
function ideatoapps_add_sitemap_rewrite(): void {
	add_rewrite_rule( '^sitemap\.xml$', 'index.php?sitemap=index', 'top' );
}
// /sitemap.xml is what robots.txt and search consoles are given; core serves the sitemap index at /wp-sitemap.xml.
add_action( 'init', 'ideatoapps_add_sitemap_rewrite' );

// Only apps and pages the site really offers; no products (the app page is the public one), taxonomies or user archives.
add_filter(
	'wp_sitemaps_post_types',
	static function ( array $types ): array {
		return ideatoapps_seo_enabled() ? array_intersect_key( $types, array_flip( array( 'page', 'post', 'app', 'video' ) ) ) : $types;
	}
);
add_filter(
	'wp_sitemaps_taxonomies',
	static function ( array $taxonomies ): array {
		return ideatoapps_seo_enabled() ? array() : $taxonomies;
	}
);
add_filter(
	'wp_sitemaps_add_provider',
	static function ( $provider, string $name ) {
		return ideatoapps_seo_enabled() && 'users' === $name ? false : $provider;
	},
	10,
	2
);

/**
 * Pages that must not be listed: WooCommerce's cart, checkout, account and shop pages; Blog and Contact while empty.
 *
 * @return int[]
 */
function ideatoapps_sitemap_excluded_page_ids(): array {
	$ids = array();
	foreach ( array( 'cart', 'checkout', 'myaccount', 'shop' ) as $name ) {
		$ids[] = (int) get_option( 'woocommerce_' . $name . '_page_id' );
	}
	$blog    = get_page_by_path( 'blog' );
	$contact = get_page_by_path( 'contact' );
	if ( $blog && 0 === (int) wp_count_posts( 'post' )->publish ) {
		$ids[] = $blog->ID;
	}
	if ( $contact && ! ideatoapps_contact_enabled() ) {
		$ids[] = $contact->ID;
	}
	return array_values( array_filter( $ids ) );
}

add_filter(
	'wp_sitemaps_posts_query_args',
	static function ( array $args, string $post_type ): array {
		if ( ! ideatoapps_seo_enabled() ) {
			return $args;
		}
		if ( 'app' === $post_type ) {
			$args['meta_query'] = array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- a handful of rows.
				array(
					'key'     => 'delivery_status',
					'value'   => array( 'live', 'coming_soon' ),
					'compare' => 'IN',
				),
			);
		}
		if ( 'page' === $post_type ) {
			$args['post__not_in'] = array_merge( (array) ( $args['post__not_in'] ?? array() ), ideatoapps_sitemap_excluded_page_ids() );
		}
		return $args;
	},
	10,
	2
);

// The apps and Learn archives are listed first in their own sitemap (they exist only while they have content to show).
// Core has no filter for the finished list, so the list is built once through the provider and the archive link is put in front.
add_filter(
	'wp_sitemaps_posts_pre_url_list',
	static function ( $pre, string $post_type, int $page ) {
		static $busy = false;
		if ( null !== $pre || $busy || 1 !== $page || ! ideatoapps_seo_enabled() || ! in_array( $post_type, array( 'app', 'video' ), true ) ) {
			return $pre;
		}
		$busy = true;
		$list = wp_sitemaps_get_server()->registry->get_provider( 'posts' )->get_url_list( 1, $post_type );
		$busy = false;
		$link = get_post_type_archive_link( $post_type );
		if ( $list && $link ) {
			array_unshift( $list, array( 'loc' => $link ) );
		}
		return $list;
	},
	10,
	3
);
