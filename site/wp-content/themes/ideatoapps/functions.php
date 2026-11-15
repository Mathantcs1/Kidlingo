<?php
/**
 * IdeaToApps theme bootstrap.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'IDEATOAPPS_THEME_VERSION', '0.2.0' );

require_once get_template_directory() . '/inc/head.php';
require_once get_template_directory() . '/inc/navigation.php';

add_action(
	'after_setup_theme',
	static function (): void {
		load_theme_textdomain( 'ideatoapps', get_template_directory() . '/languages' );
		add_theme_support( 'title-tag' );
		add_theme_support( 'html5', array( 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script' ) );
		add_theme_support( 'post-thumbnails' );
		add_theme_support( 'responsive-embeds' );
		add_theme_support( 'woocommerce' );
	}
);

add_action(
	'wp_enqueue_scripts',
	static function (): void {
		$base = get_template_directory_uri() . '/assets';
		$dir  = get_template_directory() . '/assets';
		$ver  = static fn( string $file ): string => (string) ( file_exists( "$dir/$file" ) ? filemtime( "$dir/$file" ) : IDEATOAPPS_THEME_VERSION );

		$styles = array( 'fonts', 'tokens', 'base', 'layout', 'components' );
		$prev   = array();
		foreach ( $styles as $name ) {
			wp_enqueue_style( "ideatoapps-$name", "$base/css/$name.css", $prev, $ver( "css/$name.css" ) );
			$prev = array( "ideatoapps-$name" );
		}
		wp_enqueue_style( 'ideatoapps-style', get_stylesheet_uri(), $prev, IDEATOAPPS_THEME_VERSION );

		foreach ( array( 'theme-toggle', 'nav' ) as $name ) {
			wp_enqueue_script( "ideatoapps-$name", "$base/js/$name.js", array(), $ver( "js/$name.js" ), array( 'in_footer' => true, 'strategy' => 'defer' ) );
		}
	}
);

/**
 * Include parts/{name}.php with $args available to it.
 *
 * @param string               $name Part slug (letters, digits, dash, underscore).
 * @param array<string, mixed> $args Values the part reads from $args.
 */
function ideatoapps_part( string $name, array $args = array() ): void {
	$name = preg_replace( '/[^A-Za-z0-9_-]/', '', $name );
	$file = get_theme_file_path( "parts/{$name}.php" );
	if ( '' === $name || ! is_readable( $file ) ) {
		return;
	}
	include $file;
}
