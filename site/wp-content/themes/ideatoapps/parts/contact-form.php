<?php
/**
 * The contact form, or a plain "not yet available" notice while the owner has not switched it on. No mailbox is shown.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! ideatoapps_contact_available() ) {
	?>
	<div class="notice-box" data-testid="contact-unavailable">
		<h2 class="notice-box__title"><?php esc_html_e( 'The contact form is not yet available', 'ideatoapps' ); ?></h2>
		<p><?php esc_html_e( 'We have not switched it on yet. The answers to common questions are on the FAQ page.', 'ideatoapps' ); ?></p>
		<?php ideatoapps_part( 'button', array( 'label' => __( 'Read the FAQ', 'ideatoapps' ), 'href' => home_url( '/faq/' ), 'variant' => 'secondary' ) ); ?>
	</div>
	<?php
	return;
}
?>
<form class="form" method="post" action="<?php echo esc_url( rest_url( 'ideatoapps/v1/contact' ) ); ?>" data-ideatoapps-form data-nonce="<?php echo esc_attr( wp_create_nonce( 'wp_rest' ) ); ?>" data-testid="contact-form">
	<div class="form__row">
		<label for="contact-name"><?php esc_html_e( 'Name', 'ideatoapps' ); ?></label>
		<input class="field" type="text" id="contact-name" name="name" autocomplete="name" maxlength="100" required>
	</div>
	<div class="form__row">
		<label for="contact-email"><?php esc_html_e( 'Email address', 'ideatoapps' ); ?></label>
		<input class="field" type="email" id="contact-email" name="email" autocomplete="email" required>
	</div>
	<div class="form__row">
		<label for="contact-message"><?php esc_html_e( 'Message', 'ideatoapps' ); ?></label>
		<textarea class="field field--area" id="contact-message" name="message" rows="6" maxlength="5000" required></textarea>
	</div>
	<div class="form__hp" aria-hidden="true">
		<label for="contact-website"><?php esc_html_e( 'Leave this field empty', 'ideatoapps' ); ?></label>
		<input type="text" id="contact-website" name="website" tabindex="-1" autocomplete="off" value="">
	</div>
	<div class="form__actions">
		<?php ideatoapps_part( 'button', array( 'label' => __( 'Send message', 'ideatoapps' ), 'type' => 'submit' ) ); ?>
	</div>
	<p class="form__status" data-form-status role="status" aria-live="polite" data-testid="form-status"></p>
</form>
<noscript><p class="newsletter__note"><?php esc_html_e( 'Turn on JavaScript to send a message.', 'ideatoapps' ); ?></p></noscript>
