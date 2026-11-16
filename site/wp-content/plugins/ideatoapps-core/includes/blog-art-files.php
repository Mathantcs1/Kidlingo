<?php
/**
 * Reading the plugin's art files (content/figures, content/heroes): allowlisted names only, nothing outside the folders.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Folder holding one kind of art ('figures' or 'heroes'). Filterable so tests can point at a fixture folder.
 *
 * @param string $kind 'figures' or 'heroes'.
 * @return string Directory without trailing slash, or '' for an unknown kind.
 */
function ideatoapps_blog_art_dir( string $kind ): string {
	if ( ! in_array( $kind, array( 'figures', 'heroes' ), true ) ) {
		return '';
	}
	$dir = apply_filters( 'ideatoapps_blog_art_dir', IDEATOAPPS_CORE_DIR . 'content/' . $kind, $kind );
	return is_string( $dir ) ? rtrim( $dir, '/\\' ) : '';
}

/**
 * Names of the SVG files in a folder (lowercase letters, digits and dashes only). This list is the allowlist: a name that is not
 * in it never reaches the file system.
 *
 * @param string $dir Folder.
 * @return string[]
 */
function ideatoapps_blog_art_names( string $dir ): array {
	$names = array();
	foreach ( ( '' !== $dir && is_dir( $dir ) ? scandir( $dir ) : false ) ?: array() as $file ) {
		if ( 1 === preg_match( '/\A([a-z0-9-]+)\.svg\z/', $file, $m ) ) {
			$names[] = $m[1];
		}
	}
	return $names;
}

/**
 * Cleaned inline SVG for a named figure or hero, or '' for an unknown name, an unreadable file, a file outside the folder
 * (symlink) or a file that fails the safety check. Never emits a notice.
 *
 * @param string               $kind       'figures' or 'heroes'.
 * @param string               $name       File name without .svg; must match /^[a-z0-9-]+$/.
 * @param array<string,string> $root_attrs Attributes for the <svg> element.
 * @return string
 */
function ideatoapps_blog_art_svg( string $kind, string $name, array $root_attrs = array() ): string {
	static $cache = array();
	$dir = ideatoapps_blog_art_dir( $kind );
	if ( 1 !== preg_match( '/\A[a-z0-9-]+\z/', $name ) || ! in_array( $name, ideatoapps_blog_art_names( $dir ), true ) ) {
		return '';
	}
	$path = $dir . '/' . $name . '.svg';
	$real = realpath( $path );
	$base = realpath( $dir );
	if ( false === $real || false === $base || 0 !== strpos( $real, $base . DIRECTORY_SEPARATOR ) || ! is_file( $real ) || ! is_readable( $real ) ) {
		return '';
	}
	$key = $real . '|' . (string) filemtime( $real ) . '|' . md5( (string) wp_json_encode( $root_attrs ) );
	if ( ! isset( $cache[ $key ] ) ) {
		$raw            = @file_get_contents( $real ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- a failed read must render nothing, not a warning.
		$cache[ $key ] = is_string( $raw ) ? ideatoapps_blog_svg_clean( $raw, $root_attrs ) : '';
	}
	return $cache[ $key ];
}
