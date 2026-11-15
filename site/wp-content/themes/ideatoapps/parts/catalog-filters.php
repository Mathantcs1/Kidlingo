<?php
/**
 * Catalog filter form: a plain GET form (works without JavaScript).
 *
 * Args: req (array search/category/sort).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_req  = (array) ( $args['req'] ?? array() );
$ideatoapps_cats = ideatoapps_home_categories();
?>
<form class="catalog-filters" role="search" method="get" action="<?php echo esc_url( (string) get_post_type_archive_link( 'app' ) ); ?>" data-catalog-form data-testid="catalog-filters">
	<div class="catalog-filters__field catalog-filters__field--search">
		<label for="catalog-search"><?php esc_html_e( 'Search apps', 'ideatoapps' ); ?></label>
		<input class="field" type="search" id="catalog-search" name="s" value="<?php echo esc_attr( (string) ( $ideatoapps_req['search'] ?? '' ) ); ?>" autocomplete="off">
	</div>
	<?php if ( $ideatoapps_cats ) : ?>
		<div class="catalog-filters__field">
			<label for="catalog-category"><?php esc_html_e( 'Category', 'ideatoapps' ); ?></label>
			<span class="select"><select class="field" id="catalog-category" name="category">
				<option value=""><?php esc_html_e( 'All categories', 'ideatoapps' ); ?></option>
				<?php foreach ( $ideatoapps_cats as $ideatoapps_row ) : ?>
					<option value="<?php echo esc_attr( $ideatoapps_row['term']->slug ); ?>"<?php selected( (string) ( $ideatoapps_req['category'] ?? '' ), $ideatoapps_row['term']->slug ); ?>><?php echo esc_html( $ideatoapps_row['term']->name ); ?></option>
				<?php endforeach; ?>
			</select></span>
		</div>
	<?php endif; ?>
	<div class="catalog-filters__field">
		<label for="catalog-sort"><?php esc_html_e( 'Sort by', 'ideatoapps' ); ?></label>
		<span class="select"><select class="field" id="catalog-sort" name="sort">
			<option value="newest"<?php selected( (string) ( $ideatoapps_req['sort'] ?? 'newest' ), 'newest' ); ?>><?php esc_html_e( 'Newest', 'ideatoapps' ); ?></option>
			<option value="title"<?php selected( (string) ( $ideatoapps_req['sort'] ?? '' ), 'title' ); ?>><?php esc_html_e( 'Title A to Z', 'ideatoapps' ); ?></option>
		</select></span>
	</div>
	<?php ideatoapps_part( 'button', array( 'label' => __( 'Apply filters', 'ideatoapps' ), 'type' => 'submit', 'variant' => 'secondary', 'class' => 'catalog-filters__apply' ) ); ?>
</form>
