<?php
/**
 * A single blog post.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
while ( have_posts() ) {
	the_post();
	?>
	<article class="section post" data-testid="post">
		<div class="container container--narrow">
			<nav class="breadcrumb" aria-label="<?php esc_attr_e( 'Breadcrumb', 'ideatoapps' ); ?>">
				<ol>
					<li><a href="<?php echo esc_url( home_url( '/blog/' ) ); ?>"><?php esc_html_e( 'Blog', 'ideatoapps' ); ?></a></li>
					<li aria-current="page"><?php the_title(); ?></li>
				</ol>
			</nav>
			<h1><?php the_title(); ?></h1>
			<p class="post-meta"><time datetime="<?php echo esc_attr( get_the_date( 'c' ) ); ?>"><?php echo esc_html( get_the_date() ); ?></time></p>
			<div class="prose"><?php the_content(); ?></div>
		</div>
	</article>
	<?php
}
get_footer();
