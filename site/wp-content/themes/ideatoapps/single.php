<?php
/**
 * A single blog post (the article markup lives in parts/post-article.php).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
while ( have_posts() ) {
	the_post();
	ideatoapps_part( 'post-article' );
}
get_footer();
