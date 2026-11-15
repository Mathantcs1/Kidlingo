<?php
/**
 * App detail page. Sections without content are not rendered at all.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
while ( have_posts() ) {
	the_post();
	$ideatoapps_app = get_post();
	?>
	<article class="app">
		<?php
		ideatoapps_part( 'app-hero', array( 'app' => $ideatoapps_app ) );
		ideatoapps_part( 'app-details', array( 'app' => $ideatoapps_app ) );
		ideatoapps_part( 'app-faq', array( 'app' => $ideatoapps_app ) );
		ideatoapps_part( 'app-whats-new', array( 'app' => $ideatoapps_app ) );
		ideatoapps_part( 'app-related', array( 'app' => $ideatoapps_app ) );
		?>
	</article>
	<?php
}
get_footer();
