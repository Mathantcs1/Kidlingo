<?php
/**
 * Owner export of the newsletter list: Tools > Newsletter list, one CSV download (manage_options + nonce).
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Stored subscribers, oldest first.
 *
 * @return array<int, array{email: string, consent_at: string}>
 */
function ita_subscribers() {
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
	$rows = array();
	foreach ( $ids as $id ) {
		$rows[] = array(
			'email'      => (string) get_post_meta( $id, 'email', true ),
			'consent_at' => (string) get_post_meta( $id, 'consent_at', true ),
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
 * The list as CSV text (header email,consent_at).
 *
 * @return string
 */
function ita_subscribers_csv() {
	$tmp = fopen( 'php://temp', 'w+' );
	$csv = ideatoapps_csv_line( $tmp, array( 'email', 'consent_at' ) );
	foreach ( ita_subscribers() as $row ) {
		$csv .= ideatoapps_csv_line( $tmp, array( ideatoapps_csv_safe( $row['email'] ), $row['consent_at'] ) );
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

/**
 * Tools > Newsletter list.
 */
function ideatoapps_add_export_menu() {
	add_management_page( __( 'Newsletter list', 'ideatoapps-core' ), __( 'Newsletter list', 'ideatoapps-core' ), 'manage_options', 'ideatoapps-newsletter', 'ideatoapps_render_export_page' );
}
add_action( 'admin_menu', 'ideatoapps_add_export_menu' );

/**
 * Render the export page.
 */
function ideatoapps_render_export_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You are not allowed to view this page.', 'ideatoapps-core' ), '', array( 'response' => 403 ) );
	}
	$count = count( ita_subscribers() );
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Newsletter list', 'ideatoapps-core' ); ?></h1>
		<p>
			<?php
			/* translators: %d: number of stored addresses. */
			echo esc_html( sprintf( _n( '%d address is stored on this site, each with the time the visitor gave consent.', '%d addresses are stored on this site, each with the time the visitor gave consent.', $count, 'ideatoapps-core' ), $count ) );
			?>
		</p>
		<p><?php esc_html_e( 'No mail service is connected: nothing is sent from this site. Do not mail anyone from this list yet (launch gate G1): there is no unsubscribe link and no double opt-in, so sending marketing email would break anti-spam rules. Download the list only once both exist.', 'ideatoapps-core' ); ?></p>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<input type="hidden" name="action" value="ideatoapps_export_subscribers">
			<?php wp_nonce_field( 'ideatoapps_export_subscribers' ); ?>
			<?php submit_button( __( 'Download CSV', 'ideatoapps-core' ), 'primary', 'submit', false, $count ? array() : array( 'disabled' => 'disabled' ) ); ?>
		</form>
	</div>
	<?php
}
