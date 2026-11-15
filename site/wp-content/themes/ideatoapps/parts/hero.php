<?php
/**
 * Home hero. "Watch demos" only exists when at least one video is published.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<section class="hero" data-testid="hero">
	<div class="container hero__inner">
		<p class="section-heading__eyebrow"><?php echo esc_html( get_bloginfo( 'name' ) ); ?></p>
		<h1><?php esc_html_e( 'Useful apps. Brilliant ideas. One place.', 'ideatoapps' ); ?></h1>
		<p class="hero__lead"><?php esc_html_e( 'Practical apps built from good ideas, with clear pricing and honest write-ups.', 'ideatoapps' ); ?></p>
		<div class="hero__actions">
			<?php ideatoapps_part( 'button', array( 'label' => __( 'Explore apps', 'ideatoapps' ), 'href' => home_url( '/apps/' ) ) ); ?>
			<?php
			if ( ideatoapps_has_published_video() ) {
				ideatoapps_part( 'button', array( 'label' => __( 'Watch demos', 'ideatoapps' ), 'href' => home_url( '/learn/' ), 'variant' => 'secondary' ) );
			}
			?>
		</div>
		<div class="hero__art" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
	</div>
</section>
