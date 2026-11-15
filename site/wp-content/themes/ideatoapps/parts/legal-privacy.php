<?php
/**
 * Draft privacy policy text. Placeholders are marked "Owner to confirm"; nothing here states a fact the site does not do.
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
<h2><?php esc_html_e( 'Who is responsible', 'ideatoapps' ); ?></h2>
<p><?php $ideatoapps_confirm( __( 'legal name, postal address and a contact method of the person or company that runs this site.', 'ideatoapps' ) ); ?></p>

<h2><?php esc_html_e( 'What this site stores', 'ideatoapps' ); ?></h2>
<ul>
	<li><?php esc_html_e( 'Newsletter: if you join the list, your email address and the time you agreed are stored on this site. Nothing else is asked.', 'ideatoapps' ); ?></li>
	<li><?php esc_html_e( 'Contact form: when the form is available, the name, email address and message you type are sent to the site owner.', 'ideatoapps' ); ?></li>
	<li><?php esc_html_e( 'Purchases and accounts: to buy an app you create an account. The site keeps your name, email address, the password you chose (stored hashed), your orders, the download access that goes with them and a log of each download (time, account and IP address). Your account page shows your past orders and your library of downloads. Card details are entered with the payment provider and are not stored on this site.', 'ideatoapps' ); ?> <?php $ideatoapps_confirm( __( 'payment provider, what it receives and what this site never stores.', 'ideatoapps' ) ); ?></li>
	<li><?php esc_html_e( 'Spam protection: the newsletter and contact forms count requests per visitor to stop abuse. For this the site keeps a counter tied to a hash of your IP address (not the address itself, although a hash of an IPv4 address is weak and could be reversed by guessing). Old counters are deleted automatically (on a quiet site a few can remain until the next visitor submits a form), and they are never used for anything else.', 'ideatoapps' ); ?></li>
	<li><?php esc_html_e( 'Your colour theme choice is remembered in your own browser. It is not sent anywhere.', 'ideatoapps' ); ?></li>
</ul>

<h2><?php esc_html_e( 'Videos', 'ideatoapps' ); ?></h2>
<p><?php esc_html_e( 'Videos are hosted on YouTube. Nothing is loaded from YouTube until you press play, and then it is loaded from the privacy-enhanced youtube-nocookie.com address. After that, YouTube handles your data under its own policy.', 'ideatoapps' ); ?></p>

<h2><?php esc_html_e( 'The apps', 'ideatoapps' ); ?></h2>
<p><?php esc_html_e( 'ClipForge runs in your browser on your own computer. Decoding, rendering and encoding happen there, and your media never leaves it.', 'ideatoapps' ); ?></p>

<h2><?php esc_html_e( 'Analytics and cookies', 'ideatoapps' ); ?></h2>
<p><?php $ideatoapps_confirm( __( 'whether analytics, advertising or other cookies are used, and which cookies the shop sets once it is enabled.', 'ideatoapps' ) ); ?></p>

<h2><?php esc_html_e( 'Your rights and how long data is kept', 'ideatoapps' ); ?></h2>
<p><?php $ideatoapps_confirm( __( 'retention periods, the rights that apply in your jurisdiction and how to ask for access, correction or removal (including leaving the newsletter list).', 'ideatoapps' ) ); ?></p>
