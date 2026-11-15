<?php
/**
 * Card part. The title links to `href` and the whole card is clickable (stretched link).
 *
 * Args: title (string, required), text (string), eyebrow (string), href (string), heading (2-4, default 3),
 *       class (extra classes), content (HTML, filtered with wp_kses_post).
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
?>
<article class="<?php echo esc_attr( $classes ); ?>">
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
