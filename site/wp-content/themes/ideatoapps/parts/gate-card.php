<?php
/**
 * The subscribe card under the teaser of a subscriber-only post (shown only while the post is locked for the visitor, which also
 * means the newsletter sign-up is on). The sign-up form posts to the existing newsletter endpoint (double opt-in, consent tick)
 * through assets/js/forms.js; the "Email me a reading link" form is a plain POST that works without JavaScript.
 *
 * Honest copy only: free, a confirmation email first, nothing sent until you confirm, unsubscribe any time. No countdowns, no
 * scarcity, no pre-ticked box. The class `post-gated` is the cssSelector of the paywall JSON-LD.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_post_id = (int) ( $args['post_id'] ?? 0 );
?>
<section class="gate-card post-gated" data-testid="gate-card" aria-labelledby="gate-card-title">
	<h2 id="gate-card-title" class="gate-card__title"><?php esc_html_e( 'Read the rest for free', 'ideatoapps' ); ?></h2>
	<p><?php esc_html_e( 'The rest of this article is for newsletter subscribers. Joining is free.', 'ideatoapps' ); ?></p>
	<ul class="gate-card__facts">
		<li><?php esc_html_e( 'We send you a confirmation email first.', 'ideatoapps' ); ?></li>
		<li><?php esc_html_e( 'Nothing else is sent until you confirm.', 'ideatoapps' ); ?></li>
		<li><?php esc_html_e( 'After you confirm, the browser where you open the confirmation link can read every subscriber-only article.', 'ideatoapps' ); ?></li>
		<li><?php esc_html_e( 'You can unsubscribe at any time, and reading locks again.', 'ideatoapps' ); ?></li>
	</ul>
	<form class="newsletter__form" method="post" action="<?php echo esc_url( rest_url( 'ideatoapps/v1/newsletter' ) ); ?>" data-ideatoapps-form data-nonce-url="<?php echo esc_url( rest_url( 'ideatoapps/v1/nonce' ) ); ?>" data-nonce="<?php echo esc_attr( wp_create_nonce( 'wp_rest' ) ); ?>">
		<label for="gate-email"><?php esc_html_e( 'Email address', 'ideatoapps' ); ?></label>
		<div class="newsletter__row">
			<input class="field" type="email" id="gate-email" name="email" autocomplete="email" required data-testid="gate-email">
			<?php ideatoapps_part( 'button', array( 'label' => __( 'Subscribe', 'ideatoapps' ), 'type' => 'submit' ) ); ?>
		</div>
		<div class="check">
			<input type="checkbox" id="gate-consent" name="consent" value="1" required>
			<label for="gate-consent"><?php esc_html_e( 'I want to join the IdeaToApps newsletter list, and I agree that IdeaToApps stores my email address for it. I can unsubscribe or have it deleted at any time.', 'ideatoapps' ); ?></label>
		</div>
		<p class="form__status" data-form-status role="status" aria-live="polite" data-testid="form-status" id="gate-status"></p>
	</form>
	<noscript><p class="newsletter__note"><?php esc_html_e( 'Turn on JavaScript to join the list.', 'ideatoapps' ); ?></p></noscript>
	<?php if ( function_exists( 'ideatoapps_reader_link_form_html' ) ) : ?>
		<h3 class="gate-card__subtitle"><?php esc_html_e( 'Already subscribed?', 'ideatoapps' ); ?></h3>
		<p><?php esc_html_e( 'On a new device or after clearing cookies, we can email you a one-time reading link.', 'ideatoapps' ); ?></p>
		<?php echo ideatoapps_reader_link_form_html( $ideatoapps_post_id, 'gate-link' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped by the plugin. ?>
	<?php endif; ?>
</section>
