<?php
/**
 * Primary navigation and footer link data (final URLs; the target pages are created by later tasks).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The Learn link, only while at least one published video exists (otherwise /learn/ would be an empty page).
 *
 * @return array<int, array{label:string, path:string}>
 */
function ideatoapps_learn_link(): array {
	return function_exists( 'ideatoapps_has_published_video' ) && ideatoapps_has_published_video() ? array( array( 'label' => __( 'Learn', 'ideatoapps' ), 'path' => '/learn/' ) ) : array();
}

/**
 * Header links.
 *
 * @return array<int, array{label:string, path:string}>
 */
function ideatoapps_primary_links(): array {
	return (array) apply_filters(
		'ideatoapps_primary_links',
		array_merge(
			array( array( 'label' => __( 'Apps', 'ideatoapps' ), 'path' => '/apps/' ) ),
			ideatoapps_learn_link(),
			array(
				array( 'label' => __( 'Blog', 'ideatoapps' ), 'path' => '/blog/' ),
				array( 'label' => __( 'About', 'ideatoapps' ), 'path' => '/about/' ),
			)
		)
	);
}

/**
 * @return array<int, array{label:string, path:string}>
 */
function ideatoapps_footer_links(): array {
	return (array) apply_filters(
		'ideatoapps_footer_links',
		array_merge(
			array( array( 'label' => __( 'Apps', 'ideatoapps' ), 'path' => '/apps/' ) ),
			ideatoapps_learn_link(),
			array(
				array( 'label' => __( 'Blog', 'ideatoapps' ), 'path' => '/blog/' ),
				array( 'label' => __( 'About', 'ideatoapps' ), 'path' => '/about/' ),
				array( 'label' => __( 'Contact', 'ideatoapps' ), 'path' => '/contact/' ),
				array( 'label' => __( 'Privacy', 'ideatoapps' ), 'path' => '/privacy/' ),
				array( 'label' => __( 'Terms', 'ideatoapps' ), 'path' => '/terms/' ),
				array( 'label' => __( 'Refund', 'ideatoapps' ), 'path' => '/refund-policy/' ),
			)
		)
	);
}

/**
 * Whether a link path is the current request (for aria-current).
 */
function ideatoapps_is_current_path( string $path ): bool {
	$request = wp_parse_url( home_url( add_query_arg( array() ) ), PHP_URL_PATH );
	return is_string( $request ) && trailingslashit( $request ) === trailingslashit( $path );
}

/**
 * Print <li><a> items for a link list.
 *
 * @param array<int, array{label:string, path:string}> $links Links.
 */
function ideatoapps_render_links( array $links ): void {
	foreach ( $links as $link ) {
		$current = ideatoapps_is_current_path( $link['path'] ) ? ' aria-current="page"' : '';
		printf(
			'<li><a href="%1$s"%2$s>%3$s</a></li>',
			esc_url( home_url( $link['path'] ) ),
			$current, // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- fixed literal.
			esc_html( $link['label'] )
		);
	}
}
