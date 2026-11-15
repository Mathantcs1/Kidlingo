<?php
/**
 * Catalog results (count, grid or empty state, pagination). catalog.js swaps this region in place.
 *
 * Args: req (array search/category/sort).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

global $wp_query;
$ideatoapps_total = (int) $wp_query->found_posts;
?>
<p class="catalog__count" data-testid="catalog-count"><?php echo esc_html( sprintf( /* translators: %d: number of apps. */ _n( '%d app', '%d apps', $ideatoapps_total, 'ideatoapps' ), $ideatoapps_total ) ); ?></p>
<?php if ( have_posts() ) : ?>
	<div class="grid" data-testid="catalog-results">
		<?php
		while ( have_posts() ) {
			the_post();
			ideatoapps_part( 'app-card', array( 'app' => get_post(), 'heading' => 2 ) );
		}
		?>
	</div>
	<?php
	the_posts_pagination(
		array(
			'mid_size'           => 1,
			'prev_text'          => __( 'Previous', 'ideatoapps' ),
			'next_text'          => __( 'Next', 'ideatoapps' ),
			'screen_reader_text' => __( 'Pages', 'ideatoapps' ),
			'aria_label'         => __( 'Pagination', 'ideatoapps' ),
		)
	);
	?>
<?php else : ?>
	<div class="empty-state" data-testid="catalog-empty">
		<h2 class="empty-state__title"><?php esc_html_e( 'No apps match your filters', 'ideatoapps' ); ?></h2>
		<p class="empty-state__text"><?php esc_html_e( 'Try a different search or category.', 'ideatoapps' ); ?></p>
		<?php ideatoapps_part( 'button', array( 'label' => __( 'Clear filters', 'ideatoapps' ), 'href' => (string) get_post_type_archive_link( 'app' ), 'variant' => 'secondary' ) ); ?>
	</div>
<?php endif; ?>
