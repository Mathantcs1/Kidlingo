<?php
/**
 * Blog (/blog/): posts newest first, nine per page (`?pg=` so it works with any permalink setting).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_page  = ideatoapps_blog_page_number();
$ideatoapps_query = new WP_Query(
	array(
		'post_type'           => 'post',
		'post_status'         => 'publish',
		'posts_per_page'      => IDEATOAPPS_BLOG_PER_PAGE,
		'paged'               => $ideatoapps_page,
		'ignore_sticky_posts' => true,
		'orderby'             => array( 'date' => 'DESC', 'ID' => 'DESC' ),
	)
);
$ideatoapps_url   = get_permalink( get_queried_object_id() );
get_header();
?>
<section class="section blog" data-testid="blog">
	<div class="container">
		<?php ideatoapps_part( 'section-heading', array( 'level' => 1, 'title' => __( 'Blog', 'ideatoapps' ), 'text' => __( 'Notes and news from IdeaToApps.', 'ideatoapps' ) ) ); ?>
		<?php ideatoapps_part( 'post-list', array( 'posts' => $ideatoapps_query->posts ) ); ?>
		<?php if ( $ideatoapps_query->max_num_pages > 1 ) : ?>
			<nav class="pagination" aria-label="<?php esc_attr_e( 'Blog pages', 'ideatoapps' ); ?>">
				<div class="nav-links">
					<?php if ( $ideatoapps_page > 1 ) : ?>
						<a class="page-numbers" rel="prev" href="<?php echo esc_url( 2 === $ideatoapps_page ? $ideatoapps_url : add_query_arg( 'pg', $ideatoapps_page - 1, $ideatoapps_url ) ); ?>"><?php esc_html_e( 'Newer posts', 'ideatoapps' ); ?></a>
					<?php endif; ?>
					<?php if ( $ideatoapps_page < $ideatoapps_query->max_num_pages ) : ?>
						<a class="page-numbers" rel="next" href="<?php echo esc_url( add_query_arg( 'pg', $ideatoapps_page + 1, $ideatoapps_url ) ); ?>"><?php esc_html_e( 'Older posts', 'ideatoapps' ); ?></a>
					<?php endif; ?>
				</div>
			</nav>
		<?php endif; ?>
	</div>
</section>
<?php
ideatoapps_part( 'newsletter' );
get_footer();
