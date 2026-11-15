<?php
/**
 * Organization and WebSite structured data for the home page. Nothing is invented: the only outside link is the YouTube
 * channel option when the owner has set one, and there is no SearchAction because the site search is not a public feature.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * @return array JSON-LD document with an Organization and a WebSite node.
 */
function ideatoapps_site_jsonld(): array {
	$home = ideatoapps_canonical_url( '/' );
	$org  = array(
		'@type' => 'Organization',
		'@id'   => $home . '#organization',
		'name'  => 'IdeaToApps',
		'url'   => $home,
	);
	if ( is_readable( get_theme_file_path( 'assets/img/icon-512.png' ) ) ) {
		$org['logo'] = get_theme_file_uri( 'assets/img/icon-512.png' );
	}
	$channel = function_exists( 'ideatoapps_youtube_channel_url' ) ? ideatoapps_youtube_channel_url() : '';
	if ( '' !== $channel ) {
		$org['sameAs'] = array( $channel );
	}
	$site = array(
		'@type'     => 'WebSite',
		'@id'       => $home . '#website',
		'name'      => 'IdeaToApps',
		'url'       => $home,
		'publisher' => array( '@id' => $home . '#organization' ),
	);
	return ideatoapps_strip_rating_data( array( '@context' => 'https://schema.org', '@graph' => array( $org, $site ) ) );
}

add_action(
	'wp_head',
	static function (): void {
		if ( ! is_front_page() || ! ideatoapps_seo_enabled() ) {
			return;
		}
		echo '<script type="application/ld+json">' . wp_json_encode( ideatoapps_site_jsonld(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP ) . "</script>\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- JSON with hex-escaped tags.
	},
	6
);
