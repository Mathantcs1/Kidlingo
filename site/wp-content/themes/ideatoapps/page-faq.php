<?php
/**
 * FAQ: accordions built from ideatoapps_faq_items() (facts backed by the ClipForge README).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<article class="section page" data-testid="page-faq">
	<div class="container container--narrow">
		<?php ideatoapps_part( 'section-heading', array( 'level' => 1, 'title' => __( 'Frequently asked questions', 'ideatoapps' ) ) ); ?>
		<div class="faq">
			<?php foreach ( ideatoapps_faq_items() as $ideatoapps_row ) : ?>
				<details class="faq__item">
					<summary><?php echo esc_html( $ideatoapps_row['q'] ); ?></summary>
					<div class="faq__answer"><p><?php echo esc_html( $ideatoapps_row['a'] ); ?></p></div>
				</details>
			<?php endforeach; ?>
		</div>
	</div>
</article>
<?php
get_footer();
