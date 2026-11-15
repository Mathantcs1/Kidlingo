<?php
/**
 * How it works: four plain steps. No trial or demo is promised.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_steps = array(
	array( __( 'Discover', 'ideatoapps' ), __( 'Browse the apps and read what each one does, in plain language.', 'ideatoapps' ) ),
	array( __( 'Watch', 'ideatoapps' ), __( 'Where we have made a walkthrough video, watch it to see the app in action before you decide.', 'ideatoapps' ) ),
	array( __( 'Buy once', 'ideatoapps' ), __( 'Pay one time at checkout. The price on the app page is the price.', 'ideatoapps' ) ),
	array( __( 'Download and run', 'ideatoapps' ), __( 'Download your app from your account and run it on your own computer.', 'ideatoapps' ) ),
);
?>
<section class="section section--alt" data-testid="how-it-works" aria-labelledby="how-it-works-title">
	<div class="container">
		<?php ideatoapps_part( 'section-heading', array( 'id' => 'how-it-works-title', 'eyebrow' => __( 'How it works', 'ideatoapps' ), 'title' => __( 'From idea to running app in four steps', 'ideatoapps' ) ) ); ?>
		<ol class="steps">
			<?php foreach ( $ideatoapps_steps as $ideatoapps_step ) : ?>
				<li class="steps__item">
					<h3><?php echo esc_html( $ideatoapps_step[0] ); ?></h3>
					<p><?php echo esc_html( $ideatoapps_step[1] ); ?></p>
				</li>
			<?php endforeach; ?>
		</ol>
	</div>
</section>
