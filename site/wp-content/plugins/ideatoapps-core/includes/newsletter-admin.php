<?php
/**
 * Tools > Newsletter list: status counts, the stored addresses with their status, a bulk "Delete permanently" action and the
 * CSV download of the confirmed rows.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

const IDEATOAPPS_SUBSCRIBERS_PER_PAGE = 50;

/**
 * Tools > Newsletter list.
 */
function ideatoapps_add_export_menu() {
	add_management_page( __( 'Newsletter list', 'ideatoapps-core' ), __( 'Newsletter list', 'ideatoapps-core' ), 'manage_options', 'ideatoapps-newsletter', 'ideatoapps_render_export_page' );
}
add_action( 'admin_menu', 'ideatoapps_add_export_menu' );

/**
 * Whether the current user may bulk-delete with this nonce.
 *
 * @param mixed $nonce Submitted nonce.
 * @return bool
 */
function ideatoapps_can_delete_subscribers( $nonce ) {
	return current_user_can( 'manage_options' ) && is_string( $nonce ) && false !== wp_verify_nonce( $nonce, 'ideatoapps_delete_subscribers' );
}

/**
 * admin-post.php handler: permanently delete the ticked rows, then go back to the list.
 */
function ideatoapps_handle_delete_subscribers() {
	$nonce = isset( $_POST['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_POST['_wpnonce'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- verified just below.
	if ( ! ideatoapps_can_delete_subscribers( $nonce ) ) {
		wp_die( esc_html__( 'You are not allowed to delete subscribers, or the form expired.', 'ideatoapps-core' ), '', array( 'response' => 403 ) );
	}
	$ids = isset( $_POST['subscriber_ids'] ) && is_array( $_POST['subscriber_ids'] ) ? array_map( 'absint', wp_unslash( $_POST['subscriber_ids'] ) ) : array(); // phpcs:ignore WordPress.Security.NonceVerification.Missing
	$n   = ( isset( $_POST['bulk_action'] ) && 'delete' === $_POST['bulk_action'] ) ? ideatoapps_delete_subscribers( $ids ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Missing
	wp_safe_redirect( add_query_arg( 'ita_deleted', $n, admin_url( 'tools.php?page=ideatoapps-newsletter' ) ) );
	exit;
}
add_action( 'admin_post_ideatoapps_delete_subscribers', 'ideatoapps_handle_delete_subscribers' );

/**
 * Render the page.
 */
function ideatoapps_render_export_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You are not allowed to view this page.', 'ideatoapps-core' ), '', array( 'response' => 403 ) );
	}
	$all     = ita_subscribers( 'all' );
	$counts  = array_count_values( array_column( $all, 'status' ) ) + array( 'confirmed' => 0, 'pending' => 0, 'unsubscribed' => 0 );
	$pages   = max( 1, (int) ceil( count( $all ) / IDEATOAPPS_SUBSCRIBERS_PER_PAGE ) );
	$current = isset( $_GET['paged'] ) ? min( $pages, max( 1, absint( $_GET['paged'] ) ) ) : 1; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only page number.
	$rows    = array_slice( $all, ( $current - 1 ) * IDEATOAPPS_SUBSCRIBERS_PER_PAGE, IDEATOAPPS_SUBSCRIBERS_PER_PAGE );
	$deleted = isset( $_GET['ita_deleted'] ) ? absint( $_GET['ita_deleted'] ) : -1; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Newsletter list', 'ideatoapps-core' ); ?></h1>
		<?php if ( $deleted >= 0 ) : ?>
			<div class="notice notice-success is-dismissible"><p>
				<?php
				/* translators: %d: number of deleted subscribers. */
				echo esc_html( sprintf( _n( '%d subscriber was permanently deleted.', '%d subscribers were permanently deleted.', $deleted, 'ideatoapps-core' ), $deleted ) );
				?>
			</p></div>
		<?php endif; ?>
		<p data-testid="newsletter-counts">
			<?php
			/* translators: 1: confirmed count, 2: pending count, 3: unsubscribed count. */
			echo esc_html( sprintf( __( 'Confirmed: %1$d. Pending (not yet confirmed): %2$d. Unsubscribed: %3$d.', 'ideatoapps-core' ), $counts['confirmed'], $counts['pending'], $counts['unsubscribed'] ) );
			?>
		</p>
		<p><?php esc_html_e( 'Sign-ups use double opt-in: an address is only on the mailable list once its owner has clicked the link in the confirmation email. Every confirmation email carries an unsubscribe link. Only confirmed addresses are in the CSV.', 'ideatoapps-core' ); ?></p>
		<p><?php esc_html_e( 'Do not mail anyone from this list yet (launch gate G1): this site sends no newsletter and has no composer. Sending needs a working sender mailbox with SPF, DKIM and DMARC set up first. See the Bluehost guide.', 'ideatoapps-core' ); ?></p>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<input type="hidden" name="action" value="ideatoapps_export_subscribers">
			<?php wp_nonce_field( 'ideatoapps_export_subscribers' ); ?>
			<?php submit_button( __( 'Download CSV of confirmed subscribers', 'ideatoapps-core' ), 'primary', 'submit', false, $counts['confirmed'] ? array() : array( 'disabled' => 'disabled' ) ); ?>
		</form>
		<h2><?php esc_html_e( 'All stored addresses', 'ideatoapps-core' ); ?></h2>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<input type="hidden" name="action" value="ideatoapps_delete_subscribers">
			<?php wp_nonce_field( 'ideatoapps_delete_subscribers' ); ?>
			<select name="bulk_action" aria-label="<?php esc_attr_e( 'Bulk action', 'ideatoapps-core' ); ?>"><option value=""><?php esc_html_e( 'Bulk actions', 'ideatoapps-core' ); ?></option><option value="delete"><?php esc_html_e( 'Delete permanently', 'ideatoapps-core' ); ?></option></select>
			<?php submit_button( __( 'Apply', 'ideatoapps-core' ), 'secondary', 'apply', false ); ?>
			<table class="widefat striped" data-testid="newsletter-table">
				<thead><tr><th class="check-column"></th><th><?php esc_html_e( 'Email', 'ideatoapps-core' ); ?></th><th><?php esc_html_e( 'Status', 'ideatoapps-core' ); ?></th><th><?php esc_html_e( 'Consent given', 'ideatoapps-core' ); ?></th><th><?php esc_html_e( 'Confirmed', 'ideatoapps-core' ); ?></th></tr></thead>
				<tbody>
				<?php foreach ( $rows as $row ) : ?>
					<tr>
						<th class="check-column"><input type="checkbox" name="subscriber_ids[]" value="<?php echo (int) $row['id']; ?>" aria-label="<?php esc_attr_e( 'Select', 'ideatoapps-core' ); ?>"></th>
						<td><?php echo esc_html( $row['email'] ); ?></td>
						<td><?php echo esc_html( $row['status'] ); ?></td>
						<td><?php echo esc_html( $row['consent_at'] ); ?></td>
						<td><?php echo esc_html( $row['confirmed_at'] ); ?></td>
					</tr>
				<?php endforeach; ?>
				<?php if ( ! $rows ) : ?>
					<tr><td colspan="5"><?php esc_html_e( 'No addresses are stored.', 'ideatoapps-core' ); ?></td></tr>
				<?php endif; ?>
				</tbody>
			</table>
		</form>
		<?php if ( $pages > 1 ) : ?>
			<p><?php echo wp_kses_post( paginate_links( array( 'base' => add_query_arg( 'paged', '%#%' ), 'format' => '', 'current' => $current, 'total' => $pages ) ) ); ?></p>
		<?php endif; ?>
	</div>
	<?php
}
