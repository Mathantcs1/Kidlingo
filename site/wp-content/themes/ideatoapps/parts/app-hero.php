<?php
/**
 * App detail hero: breadcrumb, icon, title, tagline and buy area.
 *
 * Args: app (WP_Post).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_app = $args['app'] ?? null;
if ( ! $ideatoapps_app instanceof WP_Post ) {
	return;
}
$ideatoapps_title   = get_the_title( $ideatoapps_app );
$ideatoapps_tagline = trim( (string) get_post_meta( $ideatoapps_app->ID, 'tagline', true ) );
$ideatoapps_terms   = get_the_terms( $ideatoapps_app, 'app_category' );
$ideatoapps_image   = (int) get_post_thumbnail_id( $ideatoapps_app ) > 0 ? wp_get_attachment_image( (int) get_post_thumbnail_id( $ideatoapps_app ), 'medium', false, array( 'alt' => '', 'decoding' => 'async' ) ) : '';
?>
<header class="app-hero" data-testid="app-hero">
	<div class="container">
		<nav class="breadcrumb" aria-label="<?php esc_attr_e( 'Breadcrumb', 'ideatoapps' ); ?>">
			<ol>
				<li><a href="<?php echo esc_url( (string) get_post_type_archive_link( 'app' ) ); ?>"><?php esc_html_e( 'Apps', 'ideatoapps' ); ?></a></li>
				<li aria-current="page"><?php echo esc_html( $ideatoapps_title ); ?></li>
			</ol>
		</nav>
		<div class="app-hero__grid">
			<?php if ( '' !== $ideatoapps_image ) : ?>
				<div class="app-icon" data-testid="app-icon"><?php echo $ideatoapps_image; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- core attachment markup. ?></div>
			<?php else : ?>
				<div class="app-icon app-icon--placeholder" data-testid="app-icon" data-initial="<?php echo esc_attr( mb_strtoupper( mb_substr( wp_strip_all_tags( $ideatoapps_title ), 0, 1 ) ) ); ?>" aria-hidden="true"></div>
			<?php endif; ?>
			<div class="app-hero__text">
				<?php if ( is_array( $ideatoapps_terms ) && $ideatoapps_terms ) : ?>
					<p class="app-hero__eyebrow"><?php echo esc_html( $ideatoapps_terms[0]->name ); ?></p>
				<?php endif; ?>
				<h1><?php echo esc_html( $ideatoapps_title ); ?></h1>
				<?php if ( '' !== $ideatoapps_tagline ) : ?>
					<p class="app-hero__lead" data-testid="app-tagline"><?php echo esc_html( $ideatoapps_tagline ); ?></p>
				<?php endif; ?>
				<?php ideatoapps_part( 'app-buy', array( 'app' => $ideatoapps_app ) ); ?>
			</div>
		</div>
	</div>
</header>
