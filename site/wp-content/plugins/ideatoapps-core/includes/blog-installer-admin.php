<?php
/**
 * Settings > IdeaToApps > "Starter articles": install button (admin-post, capability + nonce), result notice, review progress.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/** Whether the current user may run the installer with this nonce. */
function ideatoapps_blog_can_install( $nonce ): bool {
	return current_user_can( 'manage_options' ) && is_string( $nonce ) && '' !== $nonce && false !== wp_verify_nonce( $nonce, 'ideatoapps_install_starter' );
}

/** admin-post.php handler. */
function ideatoapps_handle_install_starter() {
	$nonce = isset( $_POST['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_POST['_wpnonce'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- verified just below.
	if ( ! ideatoapps_blog_can_install( $nonce ) ) {
		wp_die( esc_html__( 'You are not allowed to install articles, or the form expired.', 'ideatoapps-core' ), '', array( 'response' => 403 ) );
	}
	$r = ideatoapps_blog_install();
	wp_safe_redirect( add_query_arg( array( 'ita_created' => $r['created'], 'ita_skipped' => $r['skipped'], 'ita_errors' => $r['errors'], 'ita_locked' => $r['locked'] ? 1 : 0 ), admin_url( 'options-general.php?page=ideatoapps-settings' ) ) );
	exit;
}
add_action( 'admin_post_ideatoapps_install_starter', 'ideatoapps_handle_install_starter' );

/** Whether the current user may reinstall a deleted article with this nonce. */
function ideatoapps_blog_can_reinstall( $nonce ): bool {
	return current_user_can( 'manage_options' ) && is_string( $nonce ) && '' !== $nonce && false !== wp_verify_nonce( $nonce, 'ideatoapps_reinstall_starter' );
}

/** admin-post.php handler: recreate one deleted article. */
function ideatoapps_handle_reinstall_starter() {
	$nonce = isset( $_POST['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_POST['_wpnonce'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- verified just below.
	if ( ! ideatoapps_blog_can_reinstall( $nonce ) ) {
		wp_die( esc_html__( 'You are not allowed to install articles, or the form expired.', 'ideatoapps-core' ), '', array( 'response' => 403 ) );
	}
	$slug = isset( $_POST['slug'] ) ? sanitize_text_field( wp_unslash( $_POST['slug'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing
	$r    = ideatoapps_blog_reinstall( $slug );
	wp_safe_redirect( add_query_arg( array( 'ita_created' => $r['created'], 'ita_skipped' => $r['skipped'], 'ita_errors' => $r['errors'], 'ita_locked' => $r['locked'] ? 1 : 0 ), admin_url( 'options-general.php?page=ideatoapps-settings' ) ) );
	exit;
}
add_action( 'admin_post_ideatoapps_reinstall_starter', 'ideatoapps_handle_reinstall_starter' );

/** The section, printed under the settings form. */
function ideatoapps_render_starter_section(): void {
	$s = ideatoapps_blog_install_status();
	$p = ideatoapps_review_progress();
	echo '<h2>' . esc_html__( 'Starter articles', 'ideatoapps-core' ) . '</h2>';
	if ( ! empty( $_GET['ita_locked'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only.
		echo '<div class="notice notice-warning" data-testid="starter-locked"><p>' . esc_html__( 'Another install is running. Nothing was created; wait a minute and try again.', 'ideatoapps-core' ) . '</p></div>';
	} elseif ( isset( $_GET['ita_created'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only result counts.
		/* translators: 1: created, 2: skipped, 3: errors. */
		$msg = sprintf( __( 'Starter articles: %1$d created as drafts, %2$d already there (left alone), %3$d with errors.', 'ideatoapps-core' ), absint( $_GET['ita_created'] ), absint( $_GET['ita_skipped'] ?? 0 ), absint( $_GET['ita_errors'] ?? 0 ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		echo '<div class="notice notice-' . ( absint( $_GET['ita_errors'] ?? 0 ) ? 'warning' : 'success' ) . '" data-testid="starter-result"><p>' . esc_html( $msg ) . '</p></div>'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	}
	/* translators: 1: installed, 2: total article files. */
	echo '<p data-testid="starter-count">' . esc_html( sprintf( __( '%1$d of %2$d article files are installed.', 'ideatoapps-core' ), $s['installed'], $s['total'] ) ) . '</p>';
	/* translators: 1: reviewed, 2: installed starter articles. */
	echo '<p data-testid="starter-reviewed">' . esc_html( sprintf( __( '%1$d of %2$d installed starter articles human reviewed', 'ideatoapps-core' ), $p['reviewed'], $p['installed'] ) ) . '</p>';
	if ( $p['trashed'] > 0 ) {
		/* translators: %d: starter posts in the trash. */
		echo '<p data-testid="starter-trashed">' . esc_html( sprintf( __( '%d of the installed articles are in the trash.', 'ideatoapps-core' ), $p['trashed'] ) ) . '</p>';
	}
	/* translators: %d: article files without a post. */
	echo '<p data-testid="starter-missing">' . esc_html( sprintf( __( '%d article files not installed yet', 'ideatoapps-core' ), $p['missing'] ) ) . '</p>';
	echo '<p class="description">' . esc_html__( 'Articles are created as drafts and cannot be published until a person has signed them off in the "Editorial review" box. Installing again never changes or recreates a post you have edited, published or trashed.', 'ideatoapps-core' ) . '</p>';
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '"><input type="hidden" name="action" value="ideatoapps_install_starter">';
	wp_nonce_field( 'ideatoapps_install_starter' );
	submit_button( __( 'Install starter articles', 'ideatoapps-core' ), 'secondary', 'submit', false );
	echo '</form>';
	foreach ( ideatoapps_blog_missing_slugs() as $slug ) {
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" data-testid="reinstall-form"><input type="hidden" name="action" value="ideatoapps_reinstall_starter"><input type="hidden" name="slug" value="' . esc_attr( $slug ) . '">';
		wp_nonce_field( 'ideatoapps_reinstall_starter' );
		/* translators: %s: article slug. */
		echo '<p>' . esc_html( sprintf( __( 'Deleted: %s.', 'ideatoapps-core' ), $slug ) ) . ' ';
		submit_button( __( 'Reinstall a deleted article', 'ideatoapps-core' ), 'secondary small', 'submit', false );
		echo '</p></form>';
	}
	echo '<p><a href="' . esc_url( admin_url( 'edit.php?ita_review=ai_draft' ) ) . '">' . esc_html__( 'See posts by review status', 'ideatoapps-core' ) . '</a></p>';
}
add_action( 'ideatoapps_settings_page_end', 'ideatoapps_render_starter_section' );
