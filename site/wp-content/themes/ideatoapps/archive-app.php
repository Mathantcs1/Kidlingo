<?php
/**
 * Apps catalog (/apps/): search, category filter and sort as plain GET; catalog.js only enhances it.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_req = ideatoapps_catalog_request();
$ideatoapps_any = have_posts() || (bool) get_posts( ideatoapps_visible_apps_args( array( 'posts_per_page' => 1, 'fields' => 'ids' ) ) );

get_header();
?>
<section class="section catalog" data-testid="catalog">
	<div class="container">
		<?php
		ideatoapps_part(
			'section-heading',
			array(
				'level' => 1,
				'title' => __( 'Apps', 'ideatoapps' ),
				'text'  => __( 'Useful apps you buy once and run on your own computer.', 'ideatoapps' ),
			)
		);
		if ( $ideatoapps_any ) {
			ideatoapps_part( 'catalog-filters', array( 'req' => $ideatoapps_req ) );
			?>
			<div class="catalog__region" data-catalog-region aria-live="polite">
				<?php ideatoapps_part( 'catalog-results', array( 'req' => $ideatoapps_req ) ); ?>
			</div>
		<?php } else { ?>
			<div class="empty-state" data-testid="catalog-empty">
				<h2 class="empty-state__title"><?php esc_html_e( 'No apps yet', 'ideatoapps' ); ?></h2>
				<p class="empty-state__text"><?php esc_html_e( 'The first apps are on their way. Check back soon.', 'ideatoapps' ); ?></p>
			</div>
		<?php } ?>
	</div>
</section>
<?php
get_footer();
