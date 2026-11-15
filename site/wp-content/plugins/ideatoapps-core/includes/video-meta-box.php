<?php
/**
 * Video edit screen: YouTube link or ID and the related app, saved into the registered `youtube_id` and
 * `related_app_id` meta.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Accept a bare 11-character ID or a youtube.com / youtu.be / youtube-nocookie.com link and return the ID ('' if none).
 *
 * @param mixed $value Pasted text.
 * @return string
 */
function ideatoapps_extract_youtube_id( $value ) {
	$value = is_string( $value ) ? trim( $value ) : '';
	if ( '' === $value ) {
		return '';
	}
	$direct = ideatoapps_sanitize_youtube_id( $value );
	if ( '' !== $direct ) {
		return $direct;
	}
	if ( 1 === preg_match( '#^(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)/#i', $value ) ) {
		$value = 'https://' . $value;
	}
	if ( 1 !== preg_match( '#^https?://#i', $value ) ) {
		return '';
	}
	$parts = wp_parse_url( $value );
	$host  = is_array( $parts ) && isset( $parts['host'] ) ? preg_replace( '/^(www|m)\./', '', strtolower( $parts['host'] ) ) : '';
	$path  = is_array( $parts ) && isset( $parts['path'] ) ? $parts['path'] : '';
	if ( 'youtu.be' === $host ) {
		return ideatoapps_sanitize_youtube_id( trim( $path, '/' ) );
	}
	if ( 'youtube.com' !== $host && 'youtube-nocookie.com' !== $host ) {
		return '';
	}
	if ( '/watch' === rtrim( $path, '/' ) && isset( $parts['query'] ) ) {
		parse_str( $parts['query'], $query );
		return ideatoapps_sanitize_youtube_id( isset( $query['v'] ) && is_string( $query['v'] ) ? $query['v'] : '' );
	}
	return 1 === preg_match( '#^/(embed|shorts|live|v)/([A-Za-z0-9_-]{11})/?$#', $path, $m ) ? $m[2] : '';
}

/**
 * Register the box.
 */
function ideatoapps_add_video_meta_box() {
	add_meta_box( 'ideatoapps-video', __( 'Video details', 'ideatoapps-core' ), 'ideatoapps_render_video_box', 'video', 'normal', 'high' );
}
add_action( 'add_meta_boxes_video', 'ideatoapps_add_video_meta_box' );

/**
 * Render the box.
 *
 * @param WP_Post $post Video.
 */
function ideatoapps_render_video_box( $post ) {
	$youtube = (string) get_post_meta( $post->ID, 'youtube_id', true );
	$related = (int) get_post_meta( $post->ID, 'related_app_id', true );
	$apps    = get_posts( array( 'post_type' => 'app', 'post_status' => 'publish', 'numberposts' => 200, 'orderby' => 'title', 'order' => 'ASC' ) );
	wp_nonce_field( 'ideatoapps_save_video', 'ideatoapps_video_nonce' );
	?>
	<p>
		<label for="ita-youtube-id"><strong><?php esc_html_e( 'YouTube link or video ID', 'ideatoapps-core' ); ?></strong></label><br>
		<input type="text" id="ita-youtube-id" name="ita_youtube_id" class="widefat" value="<?php echo esc_attr( $youtube ); ?>" placeholder="https://www.youtube.com/watch?v=...">
		<span class="description"><?php esc_html_e( 'Paste the video link. Visitors only load YouTube after they press play.', 'ideatoapps-core' ); ?></span>
	</p>
	<p>
		<label for="ita-related-app"><strong><?php esc_html_e( 'Related app', 'ideatoapps-core' ); ?></strong></label><br>
		<select id="ita-related-app" name="ita_related_app_id">
			<option value="0"><?php esc_html_e( 'None', 'ideatoapps-core' ); ?></option>
			<?php foreach ( $apps as $app ) : ?>
				<option value="<?php echo (int) $app->ID; ?>" <?php selected( $related, $app->ID ); ?>><?php echo esc_html( get_the_title( $app ) ); ?></option>
			<?php endforeach; ?>
		</select>
	</p>
	<?php
}

/**
 * Save the box (nonce, capability, not an autosave).
 *
 * @param int $post_id Video ID.
 */
function ideatoapps_save_video_meta( $post_id ) {
	$nonce = isset( $_POST['ideatoapps_video_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['ideatoapps_video_nonce'] ) ) : '';
	if ( '' === $nonce || ! wp_verify_nonce( $nonce, 'ideatoapps_save_video' ) || ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}
	$raw = isset( $_POST['ita_youtube_id'] ) ? sanitize_text_field( wp_unslash( $_POST['ita_youtube_id'] ) ) : '';
	$id  = ideatoapps_extract_youtube_id( $raw );
	if ( '' !== $raw && '' === $id ) {
		ideatoapps_add_notice( $post_id, __( 'The YouTube link was not saved: paste a youtube.com or youtu.be link, or the 11-character video ID.', 'ideatoapps-core' ) );
	} else {
		update_post_meta( $post_id, 'youtube_id', $id );
	}
	update_post_meta( $post_id, 'related_app_id', isset( $_POST['ita_related_app_id'] ) ? absint( wp_unslash( $_POST['ita_related_app_id'] ) ) : 0 );
}
add_action( 'save_post_video', 'ideatoapps_save_video_meta' );
