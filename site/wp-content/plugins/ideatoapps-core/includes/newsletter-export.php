<?php
/**
 * Owner export of the newsletter list: one CSV download of the CONFIRMED subscribers (manage_options + nonce). The Tools > Newsletter list page is in newsletter-admin.php.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Subscribers with a status, oldest first. Defaults to the confirmed ones: that is the only mailable list.
 *
 * @param string $status confirmed, pending, unsubscribed or all.
 * @return array<int, array{id: int, email: string, consent_at: string, confirmed_at: string, status: string}>
 */
function ita_subscribers( $status = 'confirmed' ) {
	$ids  = get_posts(
		array(
			'post_type'      => 'ita_subscriber',
			'post_status'    => 'any',
			'posts_per_page' => -1,
			'fields'         => 'ids',
			'orderby'        => array( 'date' => 'ASC', 'ID' => 'ASC' ),
			'no_found_rows'  => true,
		)
	);
	update_meta_cache( 'post', $ids );
	$rows = array();
	foreach ( $ids as $id ) {
		$st = ideatoapps_subscriber_status( $id );
		if ( 'all' !== $status && $st !== $status ) {
			continue;
		}
		if ( 'confirmed' === $status && '0' === (string) get_post_meta( $id, 'newsletter_consent', true ) ) {
			continue; // confirmed for reading only, no newsletter consent: never on the mailable list (rows without the flag predate it and consented).
		}
		$rows[] = array(
			'id'           => (int) $id,
			'email'        => (string) get_post_meta( $id, 'email', true ),
			'consent_at'   => (string) get_post_meta( $id, 'consent_at', true ),
			'confirmed_at' => (string) get_post_meta( $id, 'confirmed_at', true ),
			'status'       => $st,
		);
	}
	return $rows;
}

/**
 * A spreadsheet would run a cell starting with = + - @ as a formula; a leading apostrophe makes it plain text.
 *
 * @param string $value Cell.
 * @return string
 */
function ideatoapps_csv_safe( $value ) {
	return 1 === preg_match( '/^[=+\-@\t\r]/', $value ) ? "'" . $value : $value;
}

/**
 * One CSV line with LF ending. fputcsv() only accepts a line-ending argument from PHP 8.1 and this plugin supports
 * PHP 8.0, so the line is written to a temp stream with the default ending and normalised here.
 *
 * @param resource           $stream Temp stream.
 * @param array<int, string> $cells  Cells.
 * @return string
 */
function ideatoapps_csv_line( $stream, array $cells ) {
	ftruncate( $stream, 0 );
	rewind( $stream );
	fputcsv( $stream, $cells, ',', '"', '\\' );
	rewind( $stream );
	return rtrim( (string) stream_get_contents( $stream ), "\r\n" ) . "\n";
}

/**
 * The confirmed list as CSV text (header email,consent_at,confirmed_at,status).
 *
 * @return string
 */
function ita_subscribers_csv() {
	$tmp = fopen( 'php://temp', 'w+' );
	$csv = ideatoapps_csv_line( $tmp, array( 'email', 'consent_at', 'confirmed_at', 'status' ) );
	foreach ( ita_subscribers() as $row ) {
		$csv .= ideatoapps_csv_line( $tmp, array( ideatoapps_csv_safe( $row['email'] ), $row['consent_at'], $row['confirmed_at'], $row['status'] ) );
	}
	fclose( $tmp );
	return $csv;
}

/**
 * Whether the current user may export with this nonce.
 *
 * @param mixed $nonce Submitted nonce.
 * @return bool
 */
function ideatoapps_can_export_subscribers( $nonce ) {
	return current_user_can( 'manage_options' ) && is_string( $nonce ) && false !== wp_verify_nonce( $nonce, 'ideatoapps_export_subscribers' );
}

/**
 * admin-post.php handler: stream the CSV.
 */
function ideatoapps_handle_export_subscribers() {
	$nonce = isset( $_POST['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_POST['_wpnonce'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- verified just below.
	if ( ! ideatoapps_can_export_subscribers( $nonce ) ) {
		wp_die( esc_html__( 'You are not allowed to export the list, or the form expired.', 'ideatoapps-core' ), '', array( 'response' => 403 ) );
	}
	nocache_headers();
	header( 'Content-Type: text/csv; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename="newsletter-list-' . gmdate( 'Y-m-d' ) . '.csv"' );
	echo ita_subscribers_csv(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- CSV download, not HTML.
	exit;
}
add_action( 'admin_post_ideatoapps_export_subscribers', 'ideatoapps_handle_export_subscribers' );
