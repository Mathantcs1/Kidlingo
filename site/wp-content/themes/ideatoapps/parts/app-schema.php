<?php
/**
 * SoftwareApplication JSON-LD seam. Printed from `ideatoapps_app_schema`, which the IdeaToApps Core plugin fills (seo.php).
 * Nothing is invented here, and rating/review properties are always stripped.
 *
 * Args: app (WP_Post).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_app = $args['app'] ?? null;
if ( ! $ideatoapps_app instanceof WP_Post ) {
	return;
}
$ideatoapps_schema = ideatoapps_app_schema( $ideatoapps_app->ID );
if ( $ideatoapps_schema ) {
	echo '<script type="application/ld+json">' . wp_json_encode( $ideatoapps_schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP ) . "</script>\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- JSON with hex-escaped tags.
}
