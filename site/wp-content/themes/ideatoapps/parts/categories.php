<?php
/**
 * Browse categories. Only categories that have at least one visible app; absent otherwise.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_cats = ideatoapps_home_categories();
if ( ! $ideatoapps_cats ) {
	return;
}
?>
<section class="section section--flush-top" data-testid="categories" aria-labelledby="categories-title">
	<div class="container">
		<?php ideatoapps_part( 'section-heading', array( 'id' => 'categories-title', 'title' => __( 'Browse by category', 'ideatoapps' ) ) ); ?>
		<ul class="chips">
			<?php foreach ( $ideatoapps_cats as $ideatoapps_cat ) : ?>
				<?php $ideatoapps_link = get_term_link( $ideatoapps_cat['term'] ); ?>
				<?php if ( is_wp_error( $ideatoapps_link ) ) : ?>
					<?php continue; ?>
				<?php endif; ?>
				<li>
					<a class="chip" href="<?php echo esc_url( $ideatoapps_link ); ?>">
						<span class="chip__name"><?php echo esc_html( $ideatoapps_cat['term']->name ); ?></span>
						<span class="chip__count">
							<?php
							/* translators: %s: number of apps in the category. */
							echo esc_html( sprintf( _n( '%s app', '%s apps', $ideatoapps_cat['count'], 'ideatoapps' ), number_format_i18n( $ideatoapps_cat['count'] ) ) );
							?>
						</span>
					</a>
				</li>
			<?php endforeach; ?>
		</ul>
	</div>
</section>
