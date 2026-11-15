<?php
require_once __DIR__ . '/CommerceTestCase.php';

/**
 * Helpers for the SEO tests: pretty permalinks, a real main query for a URL, the printed head and WooCommerce page ids.
 */
abstract class SeoTestCase extends CommerceTestCase {
	protected function setUp(): void {
		parent::setUp();
		set_current_screen( 'front' ); // an earlier admin-screen test must not leave is_admin() true.
		global $wp_rewrite;
		$wp_rewrite->set_permalink_structure( '/%postname%/' );
		ideatoapps_register_app_post_type();
		ideatoapps_register_video_post_type();
		ideatoapps_add_sitemap_rewrite(); // set_permalink_structure() drops rules added on init.
		wp_sitemaps_get_server()->register_rewrites();
		flush_rewrite_rules( false );
		wp_delete_post( 1, true ); // the sample "Hello world" post: tests decide whether the site has posts.
	}

	protected function tearDown(): void {
		global $wp_rewrite;
		$wp_rewrite->set_permalink_structure( '' );
		$wp_rewrite->flush_rules( false );
		unset( $_GET['pg'], $_GET['s'] );
		$GLOBALS['wp_the_query'] = new WP_Query();
		$GLOBALS['wp_query']     = $GLOBALS['wp_the_query'];
		parent::tearDown();
	}

	/** Run the real request parser and main query for a URL (what WordPress does before it picks a template). */
	protected function go_to( string $url ): void {
		global $wp;
		$parts                  = wp_parse_url( $url );
		$_SERVER['REQUEST_URI'] = ( $parts['path'] ?? '/' ) . ( isset( $parts['query'] ) ? '?' . $parts['query'] : '' );
		$_GET                   = array();
		parse_str( $parts['query'] ?? '', $_GET );
		$_REQUEST                = $_GET;
		$GLOBALS['wp_the_query'] = new WP_Query();
		$GLOBALS['wp_query']     = $GLOBALS['wp_the_query'];
		$public                  = $wp->public_query_vars;
		$private                 = $wp->private_query_vars;
		$GLOBALS['wp']           = new WP();
		$wp                      = $GLOBALS['wp'];
		$wp->public_query_vars   = $public;
		$wp->private_query_vars  = $private;
		foreach ( get_taxonomies( array(), 'objects' ) as $tax ) {
			if ( $tax->publicly_queryable && ! empty( $tax->query_var ) ) {
				$wp->add_query_var( $tax->query_var );
			}
		}
		foreach ( get_post_types( array(), 'objects' ) as $type ) {
			if ( is_post_type_viewable( $type ) && ! empty( $type->query_var ) ) {
				$wp->add_query_var( $type->query_var );
			}
		}
		$wp->parse_request( $parts['query'] ?? '' );
		$wp->query_posts();
		$wp->handle_404();
		$wp->register_globals();
	}

	/** Everything printed in <head> for the current request. */
	protected function head(): string {
		ob_start();
		wp_head();
		return (string) ob_get_clean();
	}

	protected function title(): string {
		return html_entity_decode( wp_get_document_title(), ENT_QUOTES, 'UTF-8' );
	}

	protected function meta( string $head, string $attr, string $name ): ?string {
		return preg_match( '/<meta ' . $attr . '=["\']' . preg_quote( $name, '/' ) . '["\'] content=["\']([^"\']*)["\']/', $head, $m ) ? html_entity_decode( $m[1] ) : null;
	}

	/** A published app with the given delivery status and meta. */
	protected function make_app( string $title, string $status = 'live', array $meta = array() ): int {
		$id = wp_insert_post( array( 'post_type' => 'app', 'post_status' => 'publish', 'post_title' => $title, 'post_content' => '<p>Body of ' . $title . '.</p>' ) );
		update_post_meta( $id, 'delivery_status', $status );
		foreach ( $meta as $key => $value ) {
			update_post_meta( $id, $key, wp_slash( $value ) );
		}
		return (int) $id;
	}

	/** The page with this slug (the test database already holds the content and WooCommerce pages), created when missing. */
	protected function make_page( string $slug, string $title ): int {
		$existing = get_page_by_path( $slug );
		if ( $existing ) {
			return $existing->ID;
		}
		return (int) wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_name' => $slug, 'post_title' => $title ) );
	}

	/** Pretend a WooCommerce page option points at a (new) page. */
	protected function woo_page( string $option, string $slug ): int {
		$id = $this->make_page( $slug, ucfirst( $slug ) );
		update_option( 'woocommerce_' . $option . '_page_id', $id );
		return $id;
	}
}
