<?php
/**
 * Blog (/blog/): posts newest first, twelve per page, with category chips and search (`?pg=` so it works with any permalink setting).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// phpcs:disable WordPress.Security.NonceVerification.Recommended -- read-only filters in a public GET.
$ideatoapps_get   = wp_unslash( $_GET );
// phpcs:enable
$ideatoapps_req   = ideatoapps_blog_request( $ideatoapps_get );
$ideatoapps_page  = $ideatoapps_req['pg'];
$ideatoapps_query = new WP_Query( ideatoapps_blog_query_args( $ideatoapps_get ) );
$ideatoapps_url   = ideatoapps_blog_base_url();
$ideatoapps_pages = $ideatoapps_page > 1 && empty( $ideatoapps_query->posts ) ? ideatoapps_list_page_count( $ideatoapps_query->query_vars ) : 0;
$ideatoapps_last  = $ideatoapps_pages > 0 ? ideatoapps_overflow_target_page( $ideatoapps_page, $ideatoapps_pages ) : 0; // A list with no matches at all keeps its honest empty state.
if ( $ideatoapps_last > 0 ) { // ?pg=99 on a two-page blog: go to the last page (keeping the filters) instead of showing "No posts yet".
	wp_safe_redirect( ideatoapps_blog_url( $ideatoapps_req, $ideatoapps_last, $ideatoapps_url ), 302 );
	exit;
}
$ideatoapps_posts    = $ideatoapps_query->posts;
$ideatoapps_featured = ideatoapps_blog_has_featured( $ideatoapps_req, (int) $ideatoapps_query->found_posts ) ? array_shift( $ideatoapps_posts ) : null;
$ideatoapps_any      = (int) wp_count_posts( 'post' )->publish > 0; // false: the blog has no posts at all (no filters to show).
get_header();
?>
<section class="section blog" data-testid="blog">
	<div class="container">
		<?php ideatoapps_part( 'section-heading', array( 'level' => 1, 'title' => __( 'Blog', 'ideatoapps' ), 'text' => __( 'Notes and news from IdeaToApps.', 'ideatoapps' ) ) ); ?>
		<?php
		if ( ! $ideatoapps_any ) {
			ideatoapps_part( 'post-list', array( 'posts' => array() ) );
		} else {
			ideatoapps_part( 'blog-filters', array( 'req' => $ideatoapps_req, 'categories' => ideatoapps_blog_categories(), 'found' => (int) $ideatoapps_query->found_posts ) );
			if ( empty( $ideatoapps_query->posts ) ) {
				ideatoapps_part( 'blog-no-results' );
			} else {
				ideatoapps_part( 'post-list', array( 'posts' => $ideatoapps_posts, 'featured' => $ideatoapps_featured ) );
			}
		}
		?>
		<?php if ( $ideatoapps_query->max_num_pages > 1 ) : ?>
			<nav class="pagination" aria-label="<?php esc_attr_e( 'Blog pages', 'ideatoapps' ); ?>">
				<div class="nav-links">
					<?php if ( $ideatoapps_page > 1 ) : ?>
						<a class="page-numbers" rel="prev" href="<?php echo esc_url( ideatoapps_blog_url( $ideatoapps_req, $ideatoapps_page - 1, $ideatoapps_url ) ); ?>"><?php esc_html_e( 'Newer posts', 'ideatoapps' ); ?></a>
					<?php endif; ?>
					<?php if ( $ideatoapps_page < $ideatoapps_query->max_num_pages ) : ?>
						<a class="page-numbers" rel="next" href="<?php echo esc_url( ideatoapps_blog_url( $ideatoapps_req, $ideatoapps_page + 1, $ideatoapps_url ) ); ?>"><?php esc_html_e( 'Older posts', 'ideatoapps' ); ?></a>
					<?php endif; ?>
				</div>
			</nav>
		<?php endif; ?>
	</div>
</section>
<?php
ideatoapps_part( 'newsletter' );
get_footer();
