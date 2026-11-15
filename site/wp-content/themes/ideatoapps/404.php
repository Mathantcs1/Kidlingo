<?php
/**
 * 404 page.
 *
 * @package IdeaToApps
 */

get_header();
?>
<section class="hero">
	<div class="container hero__inner">
		<p class="hero__code">404</p>
		<h1><?php esc_html_e( 'That page could not be found', 'ideatoapps' ); ?></h1>
		<p class="hero__lead"><?php esc_html_e( 'The link may be out of date or mistyped. Head back to the home page or browse the apps.', 'ideatoapps' ); ?></p>
		<div class="hero__actions">
			<?php ideatoapps_part( 'button', array( 'label' => __( 'Back to home', 'ideatoapps' ), 'href' => home_url( '/' ) ) ); ?>
			<?php ideatoapps_part( 'button', array( 'label' => __( 'Browse apps', 'ideatoapps' ), 'href' => home_url( '/apps/' ), 'variant' => 'secondary' ) ); ?>
		</div>
	</div>
</section>
<?php
get_footer();
