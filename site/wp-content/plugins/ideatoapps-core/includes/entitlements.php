<?php
/**
 * Entitlements: keep the WooCommerce product's downloadable files in step with an app's versions.
 *
 * Rulings: one WooCommerce file per version, id = ideatoapps_download_id(). Removing a version removes its file from the
 * product, so nobody can download it any more; existing permission rows stay (dormant) and work again if the same
 * version number is re-added. Replacing a version's file replaces it for every buyer. Nothing touches the price.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * The WooCommerce product an app sells, validated: the linked id (UNTRUSTED meta) must be a real, non-trashed simple
 * product that no other existing app owns.
 *
 * @param int $app_id App post ID.
 * @return WC_Product_Simple|null
 */
function ideatoapps_app_product( int $app_id ): ?WC_Product_Simple {
	if ( ! ideatoapps_woocommerce_active() || 'app' !== get_post_type( $app_id ) ) {
		return null;
	}
	$product_id = (int) get_post_meta( $app_id, 'woo_product_id', true );
	if ( $product_id <= 0 || 'product' !== get_post_type( $product_id ) || in_array( get_post_status( $product_id ), array( 'trash', 'auto-draft' ), true ) ) {
		return null;
	}
	$owner = (int) get_post_meta( $product_id, '_ideatoapps_app_id', true );
	if ( $owner > 0 && $owner !== $app_id && 'app' === get_post_type( $owner ) ) {
		return null;
	}
	$product = wc_get_product( $product_id );
	return $product instanceof WC_Product_Simple ? $product : null;
}

/**
 * The versions of an app that have a valid file, newest first. Each row gains `path` (real path of the file).
 *
 * @param int $app_id App post ID.
 * @return array[]
 */
function ideatoapps_downloadable_versions( int $app_id ): array {
	$out = array();
	foreach ( ideatoapps_get_versions( $app_id ) as $row ) {
		$path = ideatoapps_valid_zip_attachment( $row['attachment_id'] );
		if ( '' !== $path ) {
			$out[] = $row + array( 'path' => $path );
		}
	}
	return $out;
}

/**
 * Rebuild the product's downloadable files from the app's versions (one per version, "<App title> <version>").
 * Invalid attachments are skipped; valid ones are moved into the protected folder. Safe to call repeatedly.
 *
 * @param int $app_id App post ID.
 */
function ideatoapps_sync_product_downloads( int $app_id ): void {
	$product = ideatoapps_app_product( $app_id );
	if ( ! $product || ! class_exists( 'WC_Product_Download' ) ) {
		return;
	}
	$title     = trim( wp_strip_all_tags( html_entity_decode( get_the_title( $app_id ), ENT_QUOTES ) ) );
	$downloads = array();
	foreach ( ideatoapps_get_versions( $app_id ) as $row ) {
		$path = ideatoapps_protect_attachment_file( $row['attachment_id'], $title . '-' . $row['version'] . '.zip' );
		if ( '' === $path ) {
			continue;
		}
		$download = new WC_Product_Download();
		$download->set_id( ideatoapps_download_id( $app_id, $row['version'] ) );
		$download->set_name( trim( $title . ' ' . $row['version'] ) );
		$download->set_file( ideatoapps_protected_file_url( $path ) );
		$downloads[ $download->get_id() ] = $download;
	}
	$before = array();
	foreach ( $product->get_downloads() as $id => $download ) {
		$before[ $id ] = array( $download->get_name(), $download->get_file() );
	}
	$after = array();
	foreach ( $downloads as $id => $download ) {
		$after[ $id ] = array( $download->get_name(), $download->get_file() );
	}
	$flags_ok = $product->is_virtual() && $product->is_downloadable() && -1 === (int) $product->get_download_limit() && -1 === (int) $product->get_download_expiry();
	if ( $before === $after && $flags_ok && (int) $product->get_meta( '_ideatoapps_app_id' ) === $app_id ) {
		return;
	}
	$product->set_virtual( true );
	$product->set_downloadable( true );
	$product->set_download_limit( -1 );
	$product->set_download_expiry( -1 );
	$product->set_downloads( $downloads );
	$product->update_meta_data( '_ideatoapps_app_id', $app_id );
	$product->save();
}

/**
 * Whether an app can be bought right now: live, a published product it owns, and at least one version with a valid file
 * that is on that product. This is the single buy gate (button, add-to-cart and checkout all ask it).
 *
 * @param int $app_id App post ID.
 * @return bool
 */
function ideatoapps_app_is_sellable( int $app_id ): bool {
	if ( 'app' !== get_post_type( $app_id ) || 'publish' !== get_post_status( $app_id ) || 'live' !== get_post_meta( $app_id, 'delivery_status', true ) ) {
		return false;
	}
	$product = ideatoapps_app_product( $app_id );
	if ( ! $product || 'publish' !== get_post_status( $product->get_id() ) ) {
		return false;
	}
	foreach ( ideatoapps_downloadable_versions( $app_id ) as $row ) {
		if ( $product->has_file( ideatoapps_download_id( $app_id, $row['version'] ) ) ) {
			return true;
		}
	}
	return false;
}

/**
 * Move a version's zip into the protected folder even when no product resolves yet (not linked, trashed, owned by another
 * app, WooCommerce inactive), so it never sits in the public uploads folder. Ruling: only done while WooCommerce is active
 * (its uploads folder convention and download handling are what protect the file); without it nothing is moved. Idempotent:
 * a file already in the protected folder stays put, so the later product sync reuses the same path.
 *
 * @param int    $app_id  App post ID.
 * @param string $version Version.
 */
function ideatoapps_protect_version_file( int $app_id, string $version ): void {
	if ( ! ideatoapps_woocommerce_active() ) {
		return;
	}
	foreach ( ideatoapps_get_versions( $app_id ) as $row ) {
		if ( $row['version'] === $version ) {
			$title = trim( wp_strip_all_tags( html_entity_decode( get_the_title( $app_id ), ENT_QUOTES ) ) );
			ideatoapps_protect_attachment_file( $row['attachment_id'], $title . '-' . $version . '.zip' );
		}
	}
}

/**
 * A version was added, edited or removed: sync the product files, then give existing buyers the version.
 *
 * @param int    $app_id  App post ID.
 * @param string $version Version.
 * @param string $change  added|updated|removed.
 */
function ideatoapps_on_version_changed( $app_id, $version, $change ): void {
	if ( 'removed' !== $change ) {
		ideatoapps_protect_version_file( (int) $app_id, (string) $version );
	}
	ideatoapps_sync_product_downloads( (int) $app_id );
	if ( 'removed' !== $change ) {
		ideatoapps_grant_new_version( (int) $app_id, (string) $version );
	}
}
add_action( 'ideatoapps_version_changed', 'ideatoapps_on_version_changed', 10, 3 );

/**
 * The product link changed (or was set at creation): claim and sync the product.
 *
 * @param int    $meta_id  Unused.
 * @param int    $post_id  Post ID.
 * @param string $meta_key Meta key.
 */
function ideatoapps_on_product_link( $meta_id, $post_id, $meta_key ): void {
	if ( 'woo_product_id' === $meta_key && 'app' === get_post_type( $post_id ) ) {
		ideatoapps_sync_product_downloads( (int) $post_id );
	}
}
add_action( 'added_post_meta', 'ideatoapps_on_product_link', 10, 3 );
add_action( 'updated_post_meta', 'ideatoapps_on_product_link', 10, 3 );
