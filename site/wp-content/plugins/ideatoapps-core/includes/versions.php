<?php
/**
 * Downloadable version registry for an app, stored as one post-meta array.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

const IDEATOAPPS_VERSIONS_META = '_ideatoapps_versions';

/**
 * Whether a string is a plain x.y.z version.
 *
 * @param string $version Candidate.
 * @return bool
 */
function ideatoapps_is_semver( $version ) {
	return is_string( $version ) && 1 === preg_match( '/^\d+\.\d+\.\d+$/D', $version );
}

/**
 * Persist the version list. update_post_meta() unslashes its input, so slash first or
 * backslashes in changelogs are lost.
 *
 * @param int     $app_id   App post ID.
 * @param array[] $versions Version rows.
 */
function ideatoapps_store_versions( int $app_id, array $versions ): void {
	update_post_meta( $app_id, IDEATOAPPS_VERSIONS_META, wp_slash( array_values( $versions ) ) );
}

/**
 * Versions of an app, newest first (by semantic version, not insertion order).
 *
 * @param int $app_id App post ID.
 * @return array[] Each: version, released, changelog, attachment_id.
 */
function ideatoapps_get_versions( int $app_id ): array {
	$raw = get_post_meta( $app_id, IDEATOAPPS_VERSIONS_META, true );
	if ( ! is_array( $raw ) ) {
		return array();
	}
	$versions = array();
	foreach ( $raw as $row ) {
		if ( is_array( $row ) && isset( $row['version'] ) && ideatoapps_is_semver( $row['version'] ) ) {
			$versions[] = array(
				'version'       => $row['version'],
				'released'      => (string) ( $row['released'] ?? '' ),
				'changelog'     => (string) ( $row['changelog'] ?? '' ),
				'attachment_id' => (int) ( $row['attachment_id'] ?? 0 ),
			);
		}
	}
	usort(
		$versions,
		static function ( $a, $b ) {
			return version_compare( $b['version'], $a['version'] );
		}
	);
	return $versions;
}

/**
 * Add a version to an app.
 *
 * @param int    $app_id        App post ID.
 * @param string $version       Plain x.y.z.
 * @param string $changelog     Changelog text.
 * @param int    $attachment_id Media-library attachment holding the file.
 * @return bool False for a non-app post, invalid version or duplicate.
 */
function ideatoapps_add_version( int $app_id, string $version, string $changelog, int $attachment_id ): bool {
	if ( 'app' !== get_post_type( $app_id ) || ! ideatoapps_is_semver( $version ) ) {
		return false;
	}
	$versions = ideatoapps_get_versions( $app_id );
	if ( in_array( $version, array_column( $versions, 'version' ), true ) ) {
		return false;
	}
	$versions[] = array(
		'version'       => $version,
		'released'      => gmdate( 'Y-m-d' ),
		'changelog'     => sanitize_textarea_field( $changelog ),
		'attachment_id' => absint( $attachment_id ),
	);
	ideatoapps_store_versions( $app_id, $versions );
	return true;
}

/**
 * Change the changelog and file of an existing version (the version string is immutable).
 *
 * @param int    $app_id        App post ID.
 * @param string $version       Existing version.
 * @param string $changelog     New changelog.
 * @param int    $attachment_id New attachment ID.
 * @return bool False when the version does not exist.
 */
function ideatoapps_update_version( int $app_id, string $version, string $changelog, int $attachment_id ): bool {
	$versions = ideatoapps_get_versions( $app_id );
	foreach ( $versions as $i => $row ) {
		if ( $row['version'] === $version ) {
			$versions[ $i ]['changelog']     = sanitize_textarea_field( $changelog );
			$versions[ $i ]['attachment_id'] = absint( $attachment_id );
			ideatoapps_store_versions( $app_id, $versions );
			return true;
		}
	}
	return false;
}

/**
 * Remove a version.
 *
 * @param int    $app_id  App post ID.
 * @param string $version Version to remove.
 * @return bool False when the version does not exist.
 */
function ideatoapps_remove_version( int $app_id, string $version ): bool {
	$versions  = ideatoapps_get_versions( $app_id );
	$remaining = array_filter(
		$versions,
		static function ( $row ) use ( $version ) {
			return $row['version'] !== $version;
		}
	);
	if ( count( $remaining ) === count( $versions ) ) {
		return false;
	}
	ideatoapps_store_versions( $app_id, $remaining );
	return true;
}
