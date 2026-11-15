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
	ideatoapps_part( 'app-schema', array( 'app' => $ideatoapps_app ) );
	?>
	<article class="app">
		<?php
		if ( function_exists( 'wc_print_notices' ) ) {
			echo '<div class="container">';
			wc_print_notices(); // e.g. "cannot be purchased": a refused Buy click must say why instead of doing nothing.
			echo '</div>';
		}
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
