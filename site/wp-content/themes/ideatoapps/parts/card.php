<?php
/**
 * Card part. The title links to `href` and the whole card is clickable (stretched link).
 *
 * Args: title (string, required), text (string), eyebrow (string), href (string), heading (2-4, default 3),
 *       class (extra classes), content (HTML, filtered with wp_kses_post),
 *       image_id (attachment ID shown above the title, lazy-loaded with width/height; decorative so alt is empty),
 *       placeholder ('play': decorative play tile when there is no image).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$title   = (string) ( $args['title'] ?? '' );
$href    = (string) ( $args['href'] ?? '' );
$level   = max( 2, min( 4, (int) ( $args['heading'] ?? 3 ) ) );
$classes = trim( 'card ' . (string) ( $args['class'] ?? '' ) );
$image   = (int) ( $args['image_id'] ?? 0 ) > 0 ? wp_get_attachment_image( (int) $args['image_id'], 'medium_large', false, array( 'loading' => 'lazy', 'decoding' => 'async', 'alt' => '' ) ) : '';
?>
<article class="<?php echo esc_attr( $classes ); ?>">
	<?php if ( '' !== $image ) : ?>
		<div class="card__media"><?php echo $image; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- core attachment markup. ?></div>
	<?php elseif ( 'play' === ( $args['placeholder'] ?? '' ) ) : ?>
		<div class="card__media card__media--play" aria-hidden="true">
			<svg viewBox="0 0 24 24" focusable="false"><path d="M8 5.5v13l11-6.5z"/></svg>
		</div>
	<?php endif; ?>
	<?php if ( ! empty( $args['eyebrow'] ) ) : ?>
		<p class="card__eyebrow"><?php echo esc_html( (string) $args['eyebrow'] ); ?></p>
	<?php endif; ?>
	<h<?php echo (int) $level; ?> class="card__title">
		<?php if ( '' !== $href ) : ?>
			<a href="<?php echo esc_url( $href ); ?>"><?php echo esc_html( $title ); ?></a>
		<?php else : ?>
			<?php echo esc_html( $title ); ?>
		<?php endif; ?>
	</h<?php echo (int) $level; ?>>
	<?php if ( ! empty( $args['text'] ) ) : ?>
		<p class="card__text"><?php echo esc_html( (string) $args['text'] ); ?></p>
	<?php endif; ?>
	<?php
	if ( ! empty( $args['content'] ) ) {
		echo wp_kses_post( (string) $args['content'] );
	}
	?>
</article>
