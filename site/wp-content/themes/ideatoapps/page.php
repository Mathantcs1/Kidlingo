<?php
/**
 * Generic page: title and the editor content. The three legal pages get the DRAFT banner and, while the editor
 * content is empty, the draft text from parts/legal-{slug}.php.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
while ( have_posts() ) {
	the_post();
	$ideatoapps_slug  = (string) get_post_field( 'post_name', get_the_ID() );
	$ideatoapps_legal = ideatoapps_is_legal_slug( $ideatoapps_slug );
	$ideatoapps_body  = '' !== trim( wp_strip_all_tags( get_the_content() ) );
	?>
	<article class="section page" data-testid="page-<?php echo esc_attr( $ideatoapps_slug ); ?>">
		<div class="container<?php echo ideatoapps_is_commerce_page() ? '' : ' container--narrow'; ?>">
			<?php ideatoapps_part( 'section-heading', array( 'level' => 1, 'title' => get_the_title() ) ); ?>
			<?php
			if ( $ideatoapps_legal ) {
				ideatoapps_part( 'draft-banner' );
			}
			?>
			<div class="prose">
				<?php
				if ( $ideatoapps_body ) {
					the_content();
				} elseif ( $ideatoapps_legal ) {
					ideatoapps_part( 'legal-' . $ideatoapps_slug );
				}
				?>
			</div>
		</div>
	</article>
	<?php
}
get_footer();
