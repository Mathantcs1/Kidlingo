<?php
/**
 * Draft terms of service text.
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
<h2><?php esc_html_e( 'Who these terms are with', 'ideatoapps' ); ?></h2>
<p><?php $ideatoapps_confirm( __( 'legal name and address of the seller.', 'ideatoapps' ) ); ?></p>

<h2><?php esc_html_e( 'Buying an app', 'ideatoapps' ); ?></h2>
<?php /* translators: %s: price with currency, from the ClipForge product, such as "$24.99 USD". */ ?>
<p><?php echo esc_html( sprintf( __( 'Apps on this site are bought once. The price shown on the app page is the price you pay. ClipForge is %s, one time, and there is no free trial.', 'ideatoapps' ), ideatoapps_clipforge_price_text() ) ); ?></p>
<p><?php $ideatoapps_confirm( __( 'how taxes (sales tax or VAT) are handled and shown at checkout.', 'ideatoapps' ) ); ?></p>

<h2><?php esc_html_e( 'Downloads', 'ideatoapps' ); ?></h2>
<p><?php esc_html_e( 'You download from your library after signing in. The download link works only while you are signed in to the account that bought it and the order is paid. A refunded or cancelled order no longer gives access to the download.', 'ideatoapps' ); ?></p>

<h2><?php esc_html_e( 'Licence', 'ideatoapps' ); ?></h2>
<p><?php $ideatoapps_confirm( __( 'what the buyer may do with the app (number of devices, personal or commercial use, redistribution) and the licence text shipped inside the download.', 'ideatoapps' ) ); ?></p>

<h2><?php esc_html_e( 'Using this site', 'ideatoapps' ); ?></h2>
<p><?php esc_html_e( 'Please do not try to break the site, bypass its protections or download files you have not bought.', 'ideatoapps' ); ?></p>

<h2><?php esc_html_e( 'Warranty, liability and governing law', 'ideatoapps' ); ?></h2>
<p><?php $ideatoapps_confirm( __( 'warranty disclaimer, limit of liability, governing law and where disputes are handled. This needs a lawyer.', 'ideatoapps' ) ); ?></p>
