<?php
/**
 * Draft refund policy text. No refund period is stated: the owner has not chosen one.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
$ideatoapps_confirm = static function ( string $text ): void {
	echo '<mark class="owner-confirm">' . esc_html__( 'Owner to confirm:', 'ideatoapps' ) . ' ' . esc_html( $text ) . '</mark>';
};
?>
<h2><?php esc_html_e( 'Refunds', 'ideatoapps' ); ?></h2>
<p><?php $ideatoapps_confirm( __( 'whether refunds are offered, for how long after purchase and under which conditions.', 'ideatoapps' ) ); ?></p>

<h2><?php esc_html_e( 'How to ask for one', 'ideatoapps' ); ?></h2>
<p><?php $ideatoapps_confirm( __( 'the way a buyer requests a refund and how long the answer takes.', 'ideatoapps' ) ); ?></p>

<h2><?php esc_html_e( 'After a refund', 'ideatoapps' ); ?></h2>
<p><?php esc_html_e( 'A refunded or cancelled order no longer gives access to the download.', 'ideatoapps' ); ?></p>
