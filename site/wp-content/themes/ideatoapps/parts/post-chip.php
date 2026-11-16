<?php
/**
 * The post's first category as a chip that links to that category in the blog (nothing for the default "Uncategorized").
 *
 * Args: post_id (int).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

foreach ( get_the_category( (int) ( $args['post_id'] ?? 0 ) ) as $ideatoapps_cat ) {
	if ( (int) $ideatoapps_cat->term_id !== (int) get_option( 'default_category' ) ) {
		?>
		<p class="post-chip" data-testid="post-category"><a href="<?php echo esc_url( ideatoapps_blog_url( array( 'cat' => $ideatoapps_cat->slug, 'q' => '' ) ) ); ?>"><?php echo esc_html( $ideatoapps_cat->name ); ?></a></p>
		<?php
		break;
	}
}
