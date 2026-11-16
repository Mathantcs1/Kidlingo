<?php
/**
 * The article of a single blog post: hero, table of contents, content, "Read next". Rendered inside the loop by single.php.
 *
 * Extension slots (filters return trusted HTML, the callback escapes it): `ideatoapps_post_byline_html` (below the title) and
 * `ideatoapps_post_hero_html` (image area under the meta row). Both are empty by default.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_id      = get_the_ID();
$ideatoapps_body    = ideatoapps_post_toc( str_replace( ']]>', ']]&gt;', (string) apply_filters( 'the_content', get_the_content() ) ) );
$ideatoapps_has_toc = count( $ideatoapps_body['items'] ) >= 3;
$ideatoapps_byline  = (string) apply_filters( 'ideatoapps_post_byline_html', '', $ideatoapps_id );
$ideatoapps_hero    = (string) apply_filters( 'ideatoapps_post_hero_html', '', $ideatoapps_id );
?>
<article class="section post" data-testid="post">
	<div class="post-progress" data-testid="post-progress" aria-hidden="true"><span class="post-progress__bar"></span></div>
	<div class="container">
		<nav class="breadcrumb" aria-label="<?php esc_attr_e( 'Breadcrumb', 'ideatoapps' ); ?>">
			<ol>
				<li><a href="<?php echo esc_url( home_url( '/blog/' ) ); ?>"><?php esc_html_e( 'Blog', 'ideatoapps' ); ?></a></li>
				<li aria-current="page"><?php the_title(); ?></li>
			</ol>
		</nav>
		<header class="post-hero">
			<?php ideatoapps_part( 'post-chip', array( 'post_id' => $ideatoapps_id ) ); ?>
			<h1><?php the_title(); ?></h1>
			<?php if ( '' !== $ideatoapps_byline ) : ?>
				<div class="post-byline" data-testid="post-byline"><?php echo $ideatoapps_byline; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- trusted slot, the filter callback escapes. ?></div>
			<?php endif; ?>
			<?php ideatoapps_part( 'post-meta', array( 'post_id' => $ideatoapps_id ) ); ?>
			<?php if ( '' !== $ideatoapps_hero ) : ?>
				<div class="post-hero__media"><?php echo $ideatoapps_hero; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- trusted slot, the filter callback escapes. ?></div>
			<?php endif; ?>
		</header>
		<div class="post-layout<?php echo $ideatoapps_has_toc ? '' : ' post-layout--no-toc'; ?>">
			<?php
			if ( $ideatoapps_has_toc ) {
				ideatoapps_part( 'post-toc', array( 'items' => $ideatoapps_body['items'] ) );
			}
			?>
			<div class="prose post-body"><?php echo $ideatoapps_body['html']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the_content output. ?></div>
		</div>
		<?php ideatoapps_part( 'post-read-next', array( 'post_id' => $ideatoapps_id ) ); ?>
	</div>
</article>
