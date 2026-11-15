<?php
/**
 * Settings > IdeaToApps: which apps are featured on the home page and the YouTube channel link.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

const IDEATOAPPS_FEATURED_MAX = 6;

/**
 * An http(s) URL with a host, or an empty string for anything else.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function ideatoapps_sanitize_channel_url( $value ) {
	$value = is_string( $value ) ? trim( $value ) : '';
	if ( 1 !== preg_match( '#^https?://#i', $value ) ) {
		return '';
	}
	$url = esc_url_raw( $value, array( 'http', 'https' ) );
	return '' !== $url && '' !== (string) wp_parse_url( $url, PHP_URL_HOST ) ? $url : '';
}

/**
 * Keep only published `app` IDs, unique, in the order given, at most IDEATOAPPS_FEATURED_MAX.
 *
 * @param mixed $value Raw value (array of IDs).
 * @return int[]
 */
function ideatoapps_sanitize_featured_ids( $value ) {
	$ids = array();
	foreach ( is_array( $value ) ? $value : array() as $raw ) {
		$id = absint( $raw );
		if ( $id > 0 && ! in_array( $id, $ids, true ) && 'app' === get_post_type( $id ) && 'publish' === get_post_status( $id ) ) {
			$ids[] = $id;
		}
	}
	return array_slice( $ids, 0, IDEATOAPPS_FEATURED_MAX );
}

/**
 * Whether featured apps are chosen but none of them can currently be shown (unpublished, or delivery status not live or coming soon).
 *
 * @return bool
 */
function ideatoapps_featured_all_hidden() {
	$ids = array_values( array_filter( array_map( 'absint', (array) get_option( 'ideatoapps_featured_app_ids', array() ) ) ) );
	if ( ! $ids ) {
		return false;
	}
	$visible = get_posts(
		array(
			'post_type'      => 'app',
			'post_status'    => 'publish',
			'post__in'       => $ids,
			'posts_per_page' => 1,
			'fields'         => 'ids',
			'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- a handful of rows.
				array(
					'key'     => 'delivery_status',
					'value'   => array( 'live', 'coming_soon' ),
					'compare' => 'IN',
				),
			),
		)
	);
	return ! $visible;
}

/**
 * Register the options so every writer, not only the form, goes through the same sanitisers.
 */
function ideatoapps_register_settings() {
	register_setting( 'ideatoapps', 'ideatoapps_featured_app_ids', array( 'type' => 'array', 'sanitize_callback' => 'ideatoapps_sanitize_featured_ids', 'default' => array(), 'show_in_rest' => false ) );
	register_setting( 'ideatoapps', 'ideatoapps_contact_enabled', array( 'type' => 'boolean', 'sanitize_callback' => 'rest_sanitize_boolean', 'default' => false, 'show_in_rest' => false ) );
	register_setting( 'ideatoapps', 'ideatoapps_youtube_channel_url', array( 'type' => 'string', 'sanitize_callback' => 'ideatoapps_sanitize_channel_url', 'default' => '', 'show_in_rest' => false ) );
}
add_action( 'init', 'ideatoapps_register_settings' );

/**
 * Validate and store a submitted settings form.
 *
 * @param array $post Unslashed form fields (nonce in `_wpnonce`).
 * @return array{status: string, errors: array<string, string>} status is forbidden, bad_nonce or ok.
 */
function ideatoapps_process_settings( array $post ) {
	if ( ! current_user_can( 'manage_options' ) ) {
		return array( 'status' => 'forbidden', 'errors' => array() );
	}
	$nonce = isset( $post['_wpnonce'] ) && is_string( $post['_wpnonce'] ) ? $post['_wpnonce'] : '';
	if ( '' === $nonce || ! wp_verify_nonce( $nonce, 'ideatoapps_save_settings' ) ) {
		return array( 'status' => 'bad_nonce', 'errors' => array() );
	}

	$errors = array();
	update_option( 'ideatoapps_featured_app_ids', ideatoapps_sanitize_featured_ids( $post['featured_app_ids'] ?? array() ), false );

	update_option( 'ideatoapps_contact_enabled', ! empty( $post['contact_enabled'] ), false );

	$raw = isset( $post['youtube_channel_url'] ) && is_string( $post['youtube_channel_url'] ) ? trim( $post['youtube_channel_url'] ) : '';
	if ( '' === $raw ) {
		update_option( 'ideatoapps_youtube_channel_url', '', false );
	} elseif ( '' === ideatoapps_sanitize_channel_url( $raw ) ) {
		$errors['invalid_url'] = __( 'The YouTube channel URL was not saved: it must start with http:// or https://.', 'ideatoapps-core' );
	} else {
		update_option( 'ideatoapps_youtube_channel_url', ideatoapps_sanitize_channel_url( $raw ), false );
	}
	return array( 'status' => 'ok', 'errors' => $errors );
}

/**
 * admin-post.php handler: process, then redirect back with a status the page turns into a notice.
 */
function ideatoapps_handle_settings_post() {
	// phpcs:ignore WordPress.Security.NonceVerification.Missing -- ideatoapps_process_settings() verifies the nonce.
	$result = ideatoapps_process_settings( wp_unslash( $_POST ) );
	if ( 'ok' !== $result['status'] ) {
		wp_die( esc_html__( 'You are not allowed to change these settings, or the form expired.', 'ideatoapps-core' ), '', array( 'response' => 403 ) );
	}
	$status = isset( $result['errors']['invalid_url'] ) ? 'invalid_url' : 'saved';
	wp_safe_redirect( add_query_arg( 'ideatoapps_status', $status, admin_url( 'options-general.php?page=ideatoapps-settings' ) ) );
	exit;
}
add_action( 'admin_post_ideatoapps_save_settings', 'ideatoapps_handle_settings_post' );

/**
 * Settings > IdeaToApps menu entry.
 */
function ideatoapps_add_settings_menu() {
	add_options_page( __( 'IdeaToApps', 'ideatoapps-core' ), __( 'IdeaToApps', 'ideatoapps-core' ), 'manage_options', 'ideatoapps-settings', 'ideatoapps_render_settings_page' );
}
add_action( 'admin_menu', 'ideatoapps_add_settings_menu' );

/**
 * Render the settings page.
 */
function ideatoapps_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You are not allowed to view this page.', 'ideatoapps-core' ), '', array( 'response' => 403 ) );
	}
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only status flag chosen from a fixed list.
	$status   = isset( $_GET['ideatoapps_status'] ) ? sanitize_key( wp_unslash( $_GET['ideatoapps_status'] ) ) : '';
	$featured = array_map( 'intval', (array) get_option( 'ideatoapps_featured_app_ids', array() ) );
	$apps     = get_posts( array( 'post_type' => 'app', 'post_status' => 'publish', 'numberposts' => 200, 'orderby' => 'title', 'order' => 'ASC' ) );
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'IdeaToApps settings', 'ideatoapps-core' ); ?></h1>
		<?php if ( 'saved' === $status ) : ?>
			<div class="notice notice-success is-dismissible"><p><?php esc_html_e( 'Settings saved.', 'ideatoapps-core' ); ?></p></div>
		<?php elseif ( 'invalid_url' === $status ) : ?>
			<div class="notice notice-error"><p><?php esc_html_e( 'The YouTube channel URL was not saved: it must start with http:// or https://. Everything else was saved.', 'ideatoapps-core' ); ?></p></div>
		<?php endif; ?>
		<?php if ( ideatoapps_featured_all_hidden() ) : ?>
			<div class="notice notice-warning"><p><?php esc_html_e( 'None of your featured apps are published, so the latest apps are shown instead.', 'ideatoapps-core' ); ?></p></div>
		<?php endif; ?>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<input type="hidden" name="action" value="ideatoapps_save_settings">
			<?php wp_nonce_field( 'ideatoapps_save_settings' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="ita-featured"><?php esc_html_e( 'Featured apps', 'ideatoapps-core' ); ?></label></th>
					<td>
						<select id="ita-featured" name="featured_app_ids[]" multiple size="8" class="regular-text">
							<?php foreach ( $apps as $app ) : ?>
								<option value="<?php echo (int) $app->ID; ?>" <?php selected( in_array( $app->ID, $featured, true ) ); ?>><?php echo esc_html( get_the_title( $app ) ); ?></option>
							<?php endforeach; ?>
						</select>
						<p class="description">
							<?php
							/* translators: %d: maximum number of featured apps. */
							echo esc_html( sprintf( __( 'Up to %d apps. They are shown on the home page in the same order as this list (by title). Leave empty to show the latest apps. Apps that are not published, or not live or coming soon, are never shown; if none of your choices can be shown, the latest apps are shown instead.', 'ideatoapps-core' ), IDEATOAPPS_FEATURED_MAX ) );
							?>
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="ita-youtube"><?php esc_html_e( 'YouTube channel URL', 'ideatoapps-core' ); ?></label></th>
					<td>
						<input type="url" id="ita-youtube" name="youtube_channel_url" class="regular-text" value="<?php echo esc_attr( (string) get_option( 'ideatoapps_youtube_channel_url', '' ) ); ?>" placeholder="https://www.youtube.com/@yourchannel">
						<p class="description"><?php esc_html_e( 'Optional. Linked from the Watch & Learn section when it has videos.', 'ideatoapps-core' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Contact form', 'ideatoapps-core' ); ?></th>
					<td>
						<label for="ita-contact-enabled"><input type="checkbox" id="ita-contact-enabled" name="contact_enabled" value="1" <?php checked( ideatoapps_contact_enabled() ); ?>> <?php esc_html_e( 'Turn the contact form on', 'ideatoapps-core' ); ?></label>
						<p class="description"><?php esc_html_e( 'Leave this off until you have confirmed that the site can send mail to a mailbox you read. Messages go to the Administration Email Address in Settings > General. While it is off, the Contact page says the form is not yet available.', 'ideatoapps-core' ); ?></p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}
