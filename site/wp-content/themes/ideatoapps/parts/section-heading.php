<?php
/**
 * Section heading part.
 *
 * Args: title (string, required), eyebrow (string), text (string), level (1-4, default 2), align (start|center),
 *       id (string, id attribute of the heading, for aria-labelledby).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$level = max( 1, min( 4, (int) ( $args['level'] ?? 2 ) ) );
$id    = isset( $args['id'] ) ? sanitize_html_class( (string) $args['id'] ) : '';
$align = 'center' === ( $args['align'] ?? '' ) ? ' section-heading--center' : '';
?>
<div class="section-heading<?php echo esc_attr( $align ); ?>">
	<?php if ( ! empty( $args['eyebrow'] ) ) : ?>
		<p class="section-heading__eyebrow"><?php echo esc_html( (string) $args['eyebrow'] ); ?></p>
	<?php endif; ?>
	<h<?php echo (int) $level; ?> class="section-heading__title"<?php echo '' !== $id ? ' id="' . esc_attr( $id ) . '"' : ''; ?>><?php echo esc_html( (string) ( $args['title'] ?? '' ) ); ?></h<?php echo (int) $level; ?>>
	<?php if ( ! empty( $args['text'] ) ) : ?>
		<p class="section-heading__text"><?php echo esc_html( (string) $args['text'] ); ?></p>
	<?php endif; ?>
</div>
