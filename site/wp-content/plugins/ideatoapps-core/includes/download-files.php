<?php
/**
 * Version files: validation and protection. An attachment id comes from editable meta, so it is UNTRUSTED: only a real
 * attachment post that is a zip inside the uploads folder counts. Valid files are moved into
 * uploads/woocommerce_uploads/ideatoapps/<random>/ (denied by .htaccess, unguessable directory) and the attachment is
 * made private, so the public media library never lists or links the release zip.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Stable WooCommerce download id for one version of one app. It does not depend on the file, so replacing a version's
 * file keeps every buyer's existing permission for that version.
 *
 * @param int    $app_id  App post ID.
 * @param string $version Plain x.y.z.
 * @return string
 */
function ideatoapps_download_id( int $app_id, string $version ): string {
	return md5( 'ideatoapps:' . $app_id . ':' . $version );
}

/**
 * The real path of a version file, or '' when the attachment is not an acceptable zip.
 * Acceptable: an attachment post with a zip mime type, a file inside the uploads folder, extension .zip, ZIP signature in the first bytes.
 *
 * @param int $attachment_id Attachment post ID.
 * @return string Absolute path or ''.
 */
function ideatoapps_valid_zip_attachment( int $attachment_id ): string {
	if ( $attachment_id <= 0 || 'attachment' !== get_post_type( $attachment_id ) || ! in_array( get_post_mime_type( $attachment_id ), array( 'application/zip', 'application/x-zip-compressed' ), true ) ) {
		return '';
	}
	$file = get_attached_file( $attachment_id );
	$base = realpath( wp_upload_dir( null, false )['basedir'] );
	$real = is_string( $file ) && '' !== $file ? realpath( $file ) : false;
	if ( false === $real || false === $base || 0 !== strpos( $real, $base . DIRECTORY_SEPARATOR ) || ! is_file( $real ) ) {
		return '';
	}
	if ( 'zip' !== strtolower( pathinfo( $real, PATHINFO_EXTENSION ) ) ) {
		return '';
	}
	$handle = fopen( $real, 'rb' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen -- reads 4 bytes.
	if ( false === $handle ) {
		return '';
	}
	$magic = fread( $handle, 4 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
	fclose( $handle ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
	return in_array( $magic, array( "PK\x03\x04", "PK\x05\x06" ), true ) ? $real : '';
}

/**
 * May the current user put this attachment on a version? Ruling (review M-1): an editor of the app post could otherwise
 * point a version at ANY zip in the media library (someone else's upload) and sell it. So: the attachment must be a valid
 * zip, and the user must hold manage_options, or have uploaded it, or be keeping the value the version already has
 * (or clearing it). The rule lives in the form save only; code paths (seed, tests) call ideatoapps_add_version directly.
 *
 * @param int $attachment_id Requested attachment ID (0 clears).
 * @param int $current_id    The attachment the version has now (0 for a new version).
 * @return bool
 */
function ideatoapps_can_use_version_attachment( int $attachment_id, int $current_id ): bool {
	if ( $attachment_id <= 0 || $attachment_id === $current_id || current_user_can( 'manage_options' ) ) {
		return true;
	}
	return (int) get_post_field( 'post_author', $attachment_id ) === get_current_user_id();
}

/**
 * The protected release folder (created with deny rules when missing).
 *
 * @return string Real path, or '' when it cannot be created.
 */
function ideatoapps_protected_root(): string {
	$parent = trailingslashit( wp_upload_dir( null, false )['basedir'] ) . 'woocommerce_uploads';
	$root   = $parent . '/ideatoapps';
	if ( ! wp_mkdir_p( $root ) ) {
		return '';
	}
	$deny = "Options -Indexes\n<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nOrder deny,allow\nDeny from all\n</IfModule>\n";
	foreach ( array( $parent, $root ) as $dir ) {
		if ( ! file_exists( $dir . '/.htaccess' ) ) {
			file_put_contents( $dir . '/.htaccess', $deny ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		}
		if ( ! file_exists( $dir . '/index.html' ) ) {
			file_put_contents( $dir . '/index.html', '' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		}
	}
	$real = realpath( $root );
	return false === $real ? '' : $real;
}

/**
 * A zip protected at upload keeps its upload name until it is first put on a version; then it is renamed (in its own
 * unguessable folder) to the buyer-facing name. Files that already carry a name are never renamed again.
 *
 * @param int    $attachment_id Attachment post ID.
 * @param string $path          Real path inside the protected folder.
 * @param string $basename      Buyer-facing file name.
 * @return string Real path after the optional rename.
 */
function ideatoapps_name_protected_file( int $attachment_id, string $path, string $basename ): string {
	$name   = sanitize_file_name( $basename );
	$target = dirname( $path ) . '/' . $name;
	if ( ! get_post_meta( $attachment_id, '_ideatoapps_unnamed', true ) || '' === $name ) {
		return $path;
	}
	if ( $target === $path ) { // Already carries the buyer-facing name: nothing to rename, and never rename it later.
		delete_post_meta( $attachment_id, '_ideatoapps_unnamed' );
		return $path;
	}
	if ( file_exists( $target ) || ! rename( $path, $target ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.rename_rename
		return $path; // Flag kept: a later save can retry.
	}
	delete_post_meta( $attachment_id, '_ideatoapps_unnamed' );
	update_attached_file( $attachment_id, $target );
	return realpath( $target ) ?: $target;
}

/**
 * A zip was just uploaded to the media library: protect it right away (same helper the version save uses), so it is never
 * public between the upload and the first save of a version. Ruling: only while WooCommerce is active, like the version
 * protection. Anything that is not a real zip is left alone.
 *
 * @param int $attachment_id New attachment ID.
 */
function ideatoapps_protect_new_zip_upload( $attachment_id ): void {
	if ( ! ideatoapps_woocommerce_active() || '' === ideatoapps_valid_zip_attachment( (int) $attachment_id ) ) {
		return;
	}
	if ( '' !== ideatoapps_protect_attachment_file( (int) $attachment_id ) ) {
		update_post_meta( (int) $attachment_id, '_ideatoapps_unnamed', 1 );
	}
}
add_action( 'add_attachment', 'ideatoapps_protect_new_zip_upload' );

/**
 * Make sure a valid version file lives in the protected folder, moving it there once.
 *
 * @param int    $attachment_id Attachment post ID.
 * @param string $basename      File name the buyer will get (e.g. ClipForge-1.0.0.zip); the upload's own name when empty.
 * @return string Real path inside the protected folder, or '' (invalid file, or it could not be protected).
 */
function ideatoapps_protect_attachment_file( int $attachment_id, string $basename = '' ): string {
	$path = ideatoapps_valid_zip_attachment( $attachment_id );
	$root = '' === $path ? '' : ideatoapps_protected_root();
	if ( '' === $root ) {
		return '';
	}
	if ( 0 === strpos( $path, $root . DIRECTORY_SEPARATOR ) ) {
		return '' !== $basename ? ideatoapps_name_protected_file( $attachment_id, $path, $basename ) : $path;
	}
	$dir = $root . '/' . bin2hex( random_bytes( 6 ) );
	if ( ! wp_mkdir_p( $dir ) ) {
		return '';
	}
	$name   = '' !== $basename ? sanitize_file_name( $basename ) : basename( $path );
	$target = $dir . '/' . ( '' !== $name ? $name : basename( $path ) );
	if ( ! rename( $path, $target ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.rename_rename
		return '';
	}
	update_attached_file( $attachment_id, $target );
	wp_update_post(
		array(
			'ID'          => $attachment_id,
			'post_status' => 'private',
			'post_parent' => 0,
		)
	);
	return realpath( $target ) ?: '';
}

/**
 * The URL WooCommerce stores for a protected file. It is never printed: WooCommerce serves it through signed download links.
 *
 * @param string $path Real path inside uploads.
 * @return string
 */
function ideatoapps_protected_file_url( string $path ): string {
	$base     = realpath( wp_upload_dir( null, false )['basedir'] );
	$relative = ltrim( str_replace( '\\', '/', substr( $path, strlen( (string) $base ) ) ), '/' );
	return trailingslashit( wp_upload_dir( null, false )['baseurl'] ) . $relative;
}
