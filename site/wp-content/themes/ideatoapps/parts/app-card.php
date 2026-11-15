<?php
/**
 * App card: the generic card with the app's category, tagline, image and price (or "Coming soon" with no price).
 *
 * Args: app (WP_Post, required), heading (2-4, default 3).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_app = $args['app'] ?? null;
if ( ! $ideatoapps_app instanceof WP_Post ) {
	return;
}
$ideatoapps_status = (string) get_post_meta( $ideatoapps_app->ID, 'delivery_status', true );
$ideatoapps_price  = trim( (string) get_post_meta( $ideatoapps_app->ID, 'price_label', true ) );
$ideatoapps_terms  = get_the_terms( $ideatoapps_app, 'app_category' );
if ( 'coming_soon' === $ideatoapps_status ) {
	$ideatoapps_note = '<p class="card__note card__note--soon">' . esc_html__( 'Coming soon', 'ideatoapps' ) . '</p>';
} else {
	$ideatoapps_note = '' !== $ideatoapps_price ? '<p class="card__note">' . esc_html( $ideatoapps_price ) . '</p>' : '';
}
ideatoapps_part(
	'card',
	array(
		'title'    => get_the_title( $ideatoapps_app ),
		'href'     => get_permalink( $ideatoapps_app ),
		'heading'  => $args['heading'] ?? 3,
		'text'     => trim( (string) get_post_meta( $ideatoapps_app->ID, 'tagline', true ) ),
		'eyebrow'  => is_array( $ideatoapps_terms ) && $ideatoapps_terms ? $ideatoapps_terms[0]->name : '',
		'image_id' => (int) get_post_thumbnail_id( $ideatoapps_app ),
		'content'  => $ideatoapps_note,
	)
);
