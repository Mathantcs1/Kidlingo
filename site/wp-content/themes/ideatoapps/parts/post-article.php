<?php
/**
 * The article of a single blog post: hero (with level and audiences), table of contents, content, "Read next". Rendered inside the loop by single.php.
 *
 * Extension slots (filters return trusted HTML, the callback escapes it): `ideatoapps_post_byline_html` (below the title) and
 * `ideatoapps_post_hero_html` (image area under the meta row). The byline is empty by default; the hero is the generated art of starter posts.
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
// Subscriber-only post and a visitor who is not a confirmed reader: the plugin already cut the content to the teaser (the rest is never sent).
$ideatoapps_locked  = function_exists( 'ideatoapps_reader_is_locked' ) && ideatoapps_reader_is_locked( $ideatoapps_id );
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
			<?php ideatoapps_part( 'post-audience', array( 'post_id' => $ideatoapps_id ) ); ?>
			<?php if ( '' !== $ideatoapps_hero ) : ?>
				<div class="post-hero__media" data-testid="post-hero"><?php echo $ideatoapps_hero; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- trusted slot, the filter callback escapes. ?></div>
			<?php endif; ?>
		</header>
		<div class="post-layout<?php echo $ideatoapps_has_toc ? '' : ' post-layout--no-toc'; ?>">
			<?php
			if ( $ideatoapps_has_toc ) {
				ideatoapps_part( 'post-toc', array( 'items' => $ideatoapps_body['items'] ) );
			}
			?>
			<?php if ( $ideatoapps_locked ) : ?>
				<div class="post-body">
					<div class="prose gate-teaser" data-testid="gate-teaser"><?php echo $ideatoapps_body['html']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the_content output (the teaser). ?></div>
					<?php ideatoapps_part( 'gate-card', array( 'post_id' => $ideatoapps_id ) ); ?>
				</div>
			<?php else : ?>
				<div class="prose post-body"><?php echo $ideatoapps_body['html']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the_content output. ?></div>
			<?php endif; ?>
		</div>
		<?php ideatoapps_part( 'post-read-next', array( 'post_id' => $ideatoapps_id ) ); ?>
	</div>
</article>
