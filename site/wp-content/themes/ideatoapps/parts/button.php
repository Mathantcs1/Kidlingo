<?php
/**
 * Button part. Renders <a> when `href` is given, otherwise <button>.
 *
 * Args: label (string, required), href (string), variant (primary|secondary|ghost), size (md|sm),
 *       type (button|submit, for <button>), class (extra classes), attrs (array name => value).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$label   = (string) ( $args['label'] ?? '' );
$href    = (string) ( $args['href'] ?? '' );
$variant = in_array( $args['variant'] ?? '', array( 'primary', 'secondary', 'ghost' ), true ) ? $args['variant'] : 'primary';
$classes = trim( 'btn btn--' . $variant . ( 'sm' === ( $args['size'] ?? '' ) ? ' btn--sm' : '' ) . ' ' . (string) ( $args['class'] ?? '' ) );
$extra   = '';
foreach ( (array) ( $args['attrs'] ?? array() ) as $name => $value ) {
	$extra .= ' ' . esc_attr( (string) $name ) . '="' . esc_attr( (string) $value ) . '"';
}

if ( '' !== $href ) {
	printf( '<a class="%1$s" href="%2$s"%3$s>%4$s</a>', esc_attr( $classes ), esc_url( $href ), $extra, esc_html( $label ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $extra is escaped above.
} else {
	$type = 'submit' === ( $args['type'] ?? '' ) ? 'submit' : 'button';
	printf( '<button class="%1$s" type="%2$s"%3$s>%4$s</button>', esc_attr( $classes ), esc_attr( $type ), $extra, esc_html( $label ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $extra is escaped above.
}
