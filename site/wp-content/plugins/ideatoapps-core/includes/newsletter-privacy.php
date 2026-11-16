<?php
/**
 * WordPress personal data tools (Tools > Export / Erase Personal Data) for newsletter subscribers, looked up by email.
 * The eraser hard-deletes the row and its meta (no trash).
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Register the exporter.
 *
 * @param array $exporters Registered exporters.
 * @return array
 */
function ideatoapps_newsletter_register_exporter( $exporters ) {
	$exporters['ideatoapps-newsletter'] = array(
		'exporter_friendly_name' => __( 'IdeaToApps newsletter list', 'ideatoapps-core' ),
		'callback'               => 'ideatoapps_newsletter_privacy_export',
	);
	return $exporters;
}
add_filter( 'wp_privacy_personal_data_exporters', 'ideatoapps_newsletter_register_exporter' );

/**
 * Register the eraser.
 *
 * @param array $erasers Registered erasers.
 * @return array
 */
function ideatoapps_newsletter_register_eraser( $erasers ) {
	$erasers['ideatoapps-newsletter'] = array(
		'eraser_friendly_name' => __( 'IdeaToApps newsletter list', 'ideatoapps-core' ),
		'callback'             => 'ideatoapps_newsletter_privacy_erase',
	);
	return $erasers;
}
add_filter( 'wp_privacy_personal_data_erasers', 'ideatoapps_newsletter_register_eraser' );

/**
 * Exporter callback.
 *
 * @param string $email Email address.
 * @param int    $page  Page (everything fits on one).
 * @return array{data: array, done: bool}
 */
function ideatoapps_newsletter_privacy_export( $email, $page = 1 ) {
	$items = array();
	foreach ( ideatoapps_find_subscriber_ids( $email ) as $id ) {
		$data = array(
			array( 'name' => __( 'Email', 'ideatoapps-core' ), 'value' => (string) get_post_meta( $id, 'email', true ) ),
			array( 'name' => __( 'Status', 'ideatoapps-core' ), 'value' => ideatoapps_subscriber_status( $id ) ),
		);
		foreach ( array( 'consent_at' => __( 'Consent given at', 'ideatoapps-core' ), 'confirmed_at' => __( 'Confirmed at', 'ideatoapps-core' ), 'unsubscribed_at' => __( 'Unsubscribed at', 'ideatoapps-core' ) ) as $key => $label ) {
			$value = (string) get_post_meta( $id, $key, true );
			if ( '' !== $value ) {
				$data[] = array( 'name' => $label, 'value' => $value );
			}
		}
		$items[] = array( 'group_id' => 'ideatoapps-newsletter', 'group_label' => __( 'Newsletter list', 'ideatoapps-core' ), 'item_id' => 'newsletter-' . $id, 'data' => $data );
	}
	return array( 'data' => $items, 'done' => true );
}

/**
 * Eraser callback: hard-delete every row for the address.
 *
 * @param string $email Email address.
 * @param int    $page  Page.
 * @return array{items_removed: bool, items_retained: bool, messages: array, done: bool}
 */
function ideatoapps_newsletter_privacy_erase( $email, $page = 1 ) {
	$ids     = ideatoapps_find_subscriber_ids( $email );
	$removed = ideatoapps_delete_subscribers( $ids );
	return array( 'items_removed' => $removed > 0, 'items_retained' => $removed < count( $ids ), 'messages' => array(), 'done' => true );
}
