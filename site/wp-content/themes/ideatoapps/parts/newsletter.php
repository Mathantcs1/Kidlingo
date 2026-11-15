<?php
/**
 * Newsletter sign-up. Rendered only when the REST route /ideatoapps/v1/newsletter exists.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! ideatoapps_newsletter_available() ) {
	return;
}
?>
<section class="section section--flush-top" data-testid="newsletter" aria-labelledby="newsletter-title">
	<div class="container">
		<div class="newsletter">
			<?php ideatoapps_part( 'section-heading', array( 'id' => 'newsletter-title', 'title' => __( 'Hear about new apps', 'ideatoapps' ), 'text' => __( 'Get a short note when a new app is released.', 'ideatoapps' ) ) ); ?>
			<form class="newsletter__form" method="post" action="<?php echo esc_url( rest_url( 'ideatoapps/v1/newsletter' ) ); ?>" data-newsletter>
				<label for="newsletter-email"><?php esc_html_e( 'Email address', 'ideatoapps' ); ?></label>
				<div class="newsletter__row">
					<input class="field" type="email" id="newsletter-email" name="email" autocomplete="email" required>
					<?php ideatoapps_part( 'button', array( 'label' => __( 'Subscribe', 'ideatoapps' ), 'type' => 'submit' ) ); ?>
				</div>
			</form>
		</div>
	</div>
</section>
