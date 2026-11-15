<?php
/**
 * Front page. Each part returns early when it has nothing to show, so empty modules are absent from the page.
 *
 * @package IdeaToApps
 */

get_header();

foreach ( array( 'hero', 'featured-apps', 'categories', 'how-it-works', 'watch-learn', 'newsletter' ) as $ideatoapps_section ) {
	ideatoapps_part( $ideatoapps_section );
}

get_footer();
