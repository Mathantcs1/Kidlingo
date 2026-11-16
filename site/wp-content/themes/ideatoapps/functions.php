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
require_once get_template_directory() . '/inc/brand.php';
require_once get_template_directory() . '/inc/navigation.php';
require_once get_template_directory() . '/inc/home.php';
require_once get_template_directory() . '/inc/app-price.php';
require_once get_template_directory() . '/inc/app-data.php';
require_once get_template_directory() . '/inc/catalog.php';
require_once get_template_directory() . '/inc/content.php';
require_once get_template_directory() . '/inc/post-extras.php';
require_once get_template_directory() . '/inc/post-hero.php';
require_once get_template_directory() . '/inc/commerce.php';
require_once get_template_directory() . '/inc/library.php';

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

		if ( is_front_page() ) {
			wp_enqueue_style( 'ideatoapps-home', "$base/css/home.css", array( 'ideatoapps-components' ), $ver( 'css/home.css' ) );
		}

		if ( function_exists( 'ideatoapps_is_catalog' ) && ideatoapps_is_catalog() ) {
			wp_enqueue_style( 'ideatoapps-catalog', "$base/css/catalog.css", array( 'ideatoapps-components' ), $ver( 'css/catalog.css' ) );
			wp_enqueue_script( 'ideatoapps-catalog', "$base/js/catalog.js", array(), $ver( 'js/catalog.js' ), array( 'in_footer' => true, 'strategy' => 'defer' ) );
		}
		if ( is_singular( 'app' ) ) {
			wp_enqueue_style( 'ideatoapps-app', "$base/css/app.css", array( 'ideatoapps-components' ), $ver( 'css/app.css' ) );
		}

		if ( ideatoapps_is_content_view() ) {
			wp_enqueue_style( 'ideatoapps-content', "$base/css/content.css", array( 'ideatoapps-components' ), $ver( 'css/content.css' ) );
		}
		if ( is_singular( 'post' ) ) {
			wp_enqueue_style( 'ideatoapps-post', "$base/css/post.css", array( 'ideatoapps-content' ), $ver( 'css/post.css' ) );
			wp_enqueue_script( 'ideatoapps-post', "$base/js/post.js", array(), $ver( 'js/post.js' ), array( 'in_footer' => true, 'strategy' => 'defer' ) );
		}
		if ( is_singular( 'video' ) || is_post_type_archive( 'video' ) ) {
			wp_enqueue_script( 'ideatoapps-video', "$base/js/video-player.js", array(), $ver( 'js/video-player.js' ), array( 'in_footer' => true, 'strategy' => 'defer' ) );
		}
		if ( ideatoapps_has_json_form() ) {
			wp_enqueue_script( 'ideatoapps-forms', "$base/js/forms.js", array(), $ver( 'js/forms.js' ), array( 'in_footer' => true, 'strategy' => 'defer' ) );
		}

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
