<?php
/**
 * Date, reading time and (only when valid) "Last reviewed".
 *
 * Args: post_id (int).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_pid      = (int) ( $args['post_id'] ?? 0 );
$ideatoapps_reviewed = ideatoapps_last_reviewed( $ideatoapps_pid );
?>
<p class="post-meta" data-testid="post-meta">
	<span><time datetime="<?php echo esc_attr( get_the_date( 'c', $ideatoapps_pid ) ); ?>"><?php echo esc_html( get_the_date( '', $ideatoapps_pid ) ); ?></time></span>
	<span>
		<?php
		/* translators: %d: minutes to read. */
		echo esc_html( sprintf( __( '%d min read', 'ideatoapps' ), ideatoapps_reading_minutes( $ideatoapps_pid ) ) );
		?>
	</span>
	<?php if ( null !== $ideatoapps_reviewed ) : ?>
		<span><?php esc_html_e( 'Last reviewed', 'ideatoapps' ); ?> <time datetime="<?php echo esc_attr( $ideatoapps_reviewed ); ?>"><?php echo esc_html( wp_date( (string) get_option( 'date_format' ), (int) strtotime( $ideatoapps_reviewed . ' 12:00:00 UTC' ), new DateTimeZone( 'UTC' ) ) ); ?></time></span>
	<?php endif; ?>
</p>
