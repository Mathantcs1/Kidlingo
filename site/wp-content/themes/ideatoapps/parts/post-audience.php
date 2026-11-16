<?php
/**
 * Reader level badge and "Who this is for" audience chips of a post, from its `ita_level` and `ita_audiences` meta (known values
 * only). Nothing is printed for a post without a known level.
 *
 * Args: post_id (int).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_pid   = (int) ( $args['post_id'] ?? 0 );
$ideatoapps_level = ideatoapps_post_level( $ideatoapps_pid );
if ( '' === $ideatoapps_level ) {
	return;
}
$ideatoapps_for = ideatoapps_post_audiences( $ideatoapps_pid );
?>
<div class="post-audience" data-testid="post-audience">
	<span class="post-level post-level--<?php echo esc_attr( $ideatoapps_level ); ?>" data-testid="post-level"><span class="screen-reader-text"><?php esc_html_e( 'Level:', 'ideatoapps' ); ?> </span><?php echo esc_html( ideatoapps_blog_levels()[ $ideatoapps_level ] ); ?></span>
	<?php if ( $ideatoapps_for ) : ?>
		<p class="post-audience__for" data-testid="post-for" id="post-for-<?php echo (int) $ideatoapps_pid; ?>"><?php esc_html_e( 'Who this is for:', 'ideatoapps' ); ?></p>
		<ul class="post-audience__list" aria-labelledby="post-for-<?php echo (int) $ideatoapps_pid; ?>">
			<?php foreach ( $ideatoapps_for as $ideatoapps_label ) : ?>
				<li class="post-audience__chip"><?php echo esc_html( $ideatoapps_label ); ?></li>
			<?php endforeach; ?>
		</ul>
	<?php endif; ?>
</div>
