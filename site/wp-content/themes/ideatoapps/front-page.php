<?php
/**
 * Front page. Placeholder hero for the design system; the real home page is built in a later task.
 *
 * @package IdeaToApps
 */

get_header();
?>
<section class="hero">
	<div class="container hero__inner">
		<p class="section-heading__eyebrow"><?php echo esc_html( get_bloginfo( 'name' ) ); ?></p>
		<h1><?php esc_html_e( 'Useful apps. Brilliant ideas. One place.', 'ideatoapps' ); ?></h1>
		<p class="hero__lead"><?php esc_html_e( 'Practical apps built from good ideas, with clear pricing and honest write-ups.', 'ideatoapps' ); ?></p>
		<div class="hero__actions">
			<?php ideatoapps_part( 'button', array( 'label' => __( 'Browse apps', 'ideatoapps' ), 'href' => home_url( '/apps/' ) ) ); ?>
			<?php ideatoapps_part( 'button', array( 'label' => __( 'About IdeaToApps', 'ideatoapps' ), 'href' => home_url( '/about/' ), 'variant' => 'secondary' ) ); ?>
		</div>
	</div>
</section>
<?php
get_footer();
