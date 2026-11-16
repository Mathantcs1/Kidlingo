<?php
/**
 * Newsletter sign-up. Rendered only when `ideatoapps_newsletter_available` is true (the plugin enables it because it owns the REST route). While the owner's switch is off (option `ideatoapps_newsletter_enabled`) it shows "Sign-up is not open yet" and no form. Submitted by assets/js/forms.js.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! ideatoapps_newsletter_available() ) {
	return;
}

$ideatoapps_newsletter_open = function_exists( 'ideatoapps_newsletter_enabled' ) && ideatoapps_newsletter_enabled();
if ( ! $ideatoapps_newsletter_open ) :
	?>
<section class="section section--flush-top" data-testid="newsletter" aria-labelledby="newsletter-title">
	<div class="container">
		<div class="newsletter">
			<?php ideatoapps_part( 'section-heading', array( 'id' => 'newsletter-title', 'title' => __( 'Join the list', 'ideatoapps' ), 'text' => __( 'Sign-up is not open yet.', 'ideatoapps' ) ) ); ?>
		</div>
	</div>
</section>
	<?php
	return;
endif;
?>
<section class="section section--flush-top" data-testid="newsletter" aria-labelledby="newsletter-title">
	<div class="container">
		<div class="newsletter">
			<?php ideatoapps_part( 'section-heading', array( 'id' => 'newsletter-title', 'title' => __( 'Join the list', 'ideatoapps' ), 'text' => __( 'Enter your email address and we will send you a confirmation email. Nothing is sent until you confirm.', 'ideatoapps' ) ) ); ?>
			<form class="newsletter__form" method="post" action="<?php echo esc_url( rest_url( 'ideatoapps/v1/newsletter' ) ); ?>" data-ideatoapps-form data-nonce-url="<?php echo esc_url( rest_url( 'ideatoapps/v1/nonce' ) ); ?>" data-nonce="<?php echo esc_attr( wp_create_nonce( 'wp_rest' ) ); ?>">
				<label for="newsletter-email"><?php esc_html_e( 'Email address', 'ideatoapps' ); ?></label>
				<div class="newsletter__row">
					<input class="field" type="email" id="newsletter-email" name="email" autocomplete="email" required>
					<?php ideatoapps_part( 'button', array( 'label' => __( 'Subscribe', 'ideatoapps' ), 'type' => 'submit' ) ); ?>
				</div>
				<div class="check">
					<input type="checkbox" id="newsletter-consent" name="consent" value="1" required>
					<label for="newsletter-consent"><?php esc_html_e( 'I agree that IdeaToApps stores my email address for this list. I can unsubscribe or have it deleted at any time.', 'ideatoapps' ); ?></label>
				</div>
				<p class="form__status" data-form-status role="status" aria-live="polite" data-testid="form-status"></p>
			</form>
			<noscript><p class="newsletter__note"><?php esc_html_e( 'Turn on JavaScript to join the list.', 'ideatoapps' ); ?></p></noscript>
		</div>
	</div>
</section>
