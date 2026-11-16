<?php
/**
 * Blog filters: category chips (plain links), a GET search form and the result summary. Works without JavaScript.
 *
 * Args: req (array cat, q, pg), categories (from ideatoapps_blog_categories()), found (int matching posts).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ideatoapps_req   = (array) ( $args['req'] ?? array() ) + array( 'cat' => '', 'q' => '', 'pg' => 1 );
$ideatoapps_cats  = (array) ( $args['categories'] ?? array() );
$ideatoapps_found = (int) ( $args['found'] ?? 0 );
$ideatoapps_base  = ideatoapps_blog_base_url();
?>
<div class="blog-filters" data-testid="blog-filters">
	<form class="blog-search" role="search" method="get" action="<?php echo esc_url( $ideatoapps_base ); ?>" data-testid="blog-search">
		<label for="blog-search-q"><?php esc_html_e( 'Search articles', 'ideatoapps' ); ?></label>
		<div class="blog-search__row">
			<input class="field" type="search" id="blog-search-q" name="q" value="<?php echo htmlspecialchars( (string) $ideatoapps_req['q'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped, and shown exactly as typed (esc_attr leaves existing entities alone). ?>" maxlength="<?php echo (int) IDEATOAPPS_BLOG_SEARCH_MAX; ?>" autocomplete="off">
			<?php if ( '' !== $ideatoapps_req['cat'] ) : ?>
				<input type="hidden" name="cat" value="<?php echo esc_attr( (string) $ideatoapps_req['cat'] ); ?>">
			<?php endif; ?>
			<?php if ( ! get_option( 'permalink_structure' ) ) : ?>
				<input type="hidden" name="page_id" value="<?php echo (int) get_queried_object_id(); ?>">
			<?php endif; ?>
			<?php ideatoapps_part( 'button', array( 'label' => __( 'Search', 'ideatoapps' ), 'type' => 'submit', 'variant' => 'secondary' ) ); ?>
		</div>
	</form>
	<?php if ( $ideatoapps_cats ) : ?>
		<nav class="blog-chips" aria-label="<?php esc_attr_e( 'Categories', 'ideatoapps' ); ?>" data-testid="blog-chips">
			<ul>
				<li><a class="blog-chip" href="<?php echo esc_url( ideatoapps_blog_url( array( 'cat' => '', 'q' => $ideatoapps_req['q'] ) ) ); ?>"<?php echo '' === $ideatoapps_req['cat'] ? ' aria-current="page"' : ''; ?>><?php esc_html_e( 'All', 'ideatoapps' ); ?></a></li>
				<?php foreach ( $ideatoapps_cats as $ideatoapps_row ) : ?>
					<li><a class="blog-chip" href="<?php echo esc_url( ideatoapps_blog_url( array( 'cat' => $ideatoapps_row['slug'], 'q' => $ideatoapps_req['q'] ) ) ); ?>"<?php echo $ideatoapps_req['cat'] === $ideatoapps_row['slug'] ? ' aria-current="page"' : ''; ?>><?php echo esc_html( $ideatoapps_row['name'] ); ?><?php if ( '' === $ideatoapps_req['q'] ) : // totals only: with a search the counts would not match the results. ?> <span class="blog-chip__count" aria-hidden="true"><?php echo (int) $ideatoapps_row['count']; ?></span><span class="screen-reader-text"> <?php echo esc_html( _n( 'article', 'articles', (int) $ideatoapps_row['count'], 'ideatoapps' ) ); ?></span><?php endif; ?></a></li>
				<?php endforeach; ?>
			</ul>
		</nav>
	<?php endif; ?>
	<p class="blog-summary" data-testid="blog-summary">
		<?php
		if ( '' !== $ideatoapps_req['q'] ) {
			/* translators: 1: number of articles, 2: the search text. */
			echo htmlspecialchars( sprintf( _n( '%1$d article for "%2$s"', '%1$d articles for "%2$s"', $ideatoapps_found, 'ideatoapps' ), $ideatoapps_found, $ideatoapps_req['q'] ), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped exactly as typed.
		} else {
			/* translators: %d: number of articles. */
			echo esc_html( sprintf( _n( '%d article', '%d articles', $ideatoapps_found, 'ideatoapps' ), $ideatoapps_found ) );
		}
		?>
	</p>
</div>
