<?php
/**
 * "My library" data: the customer's downloads grouped by app, each version with its changelog.
 * The download address printed here is WooCommerce's signed, login-bound link, never the file's real address.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Group WooCommerce download rows by app. A row whose version no longer exists is dropped (a removed version is withdrawn).
 *
 * @param array[] $downloads Rows from WC()->customer->get_downloadable_products().
 * @return array[] Each: title, url, versions[] (version, released, changelog, name, url).
 */
function ideatoapps_library_items( array $downloads ): array {
	$apps = array();
	$seen = array();
	foreach ( $downloads as $row ) {
		$download_id = (string) ( $row['download_id'] ?? '' );
		$product_id  = (int) ( $row['product_id'] ?? 0 );
		$app_id      = (int) get_post_meta( $product_id, '_ideatoapps_app_id', true );
		if ( '' === $download_id || isset( $seen[ $product_id . ':' . $download_id ] ) || empty( $row['download_url'] ) ) {
			continue;
		}
		$seen[ $product_id . ':' . $download_id ] = true; // bought twice: list it once.
		$version = array(
			'version'   => '',
			'released'  => '',
			'changelog' => '',
			'name'      => (string) ( $row['download_name'] ?? '' ),
			'url'       => (string) $row['download_url'],
		);
		if ( $app_id > 0 && function_exists( 'ideatoapps_get_versions' ) ) {
			$match = null;
			foreach ( ideatoapps_get_versions( $app_id ) as $candidate ) {
				if ( ideatoapps_download_id( $app_id, $candidate['version'] ) === $download_id ) {
					$match = $candidate;
				}
			}
			if ( ! $match ) {
				continue;
			}
			$version = array_merge( $version, array_intersect_key( $match, array_flip( array( 'version', 'released', 'changelog' ) ) ) );
		}
		$key = $app_id > 0 ? 'app' . $app_id : 'product' . $product_id;
		if ( ! isset( $apps[ $key ] ) ) {
			$apps[ $key ] = array(
				'title'    => $app_id > 0 ? get_the_title( $app_id ) : (string) ( $row['product_name'] ?? '' ),
				'url'      => $app_id > 0 ? (string) get_permalink( $app_id ) : '',
				'versions' => array(),
			);
		}
		$apps[ $key ]['versions'][] = $version;
	}
	foreach ( $apps as &$app ) {
		usort(
			$app['versions'],
			static function ( $a, $b ) {
				return version_compare( $b['version'] ?: '0.0.0', $a['version'] ?: '0.0.0' );
			}
		);
	}
	return array_values( $apps );
}
