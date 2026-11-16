<?php
/**
 * Table of contents: plain anchor links. A collapsible <details> on phones, a sticky list on desktop (post.css and post.js).
 *
 * Args: items (array of {id, text}).
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<nav class="post-toc" data-testid="post-toc" aria-label="<?php esc_attr_e( 'Table of contents', 'ideatoapps' ); ?>">
	<p class="post-toc__title" aria-hidden="true"><?php esc_html_e( 'On this page', 'ideatoapps' ); ?></p>
	<details class="post-toc__details" open>
		<summary><?php esc_html_e( 'On this page', 'ideatoapps' ); ?></summary>
		<ol class="post-toc__list">
			<?php foreach ( (array) ( $args['items'] ?? array() ) as $ideatoapps_item ) : ?>
				<li><a href="#<?php echo esc_attr( (string) $ideatoapps_item['id'] ); ?>"><?php echo esc_html( (string) $ideatoapps_item['text'] ); ?></a></li>
			<?php endforeach; ?>
		</ol>
	</details>
</nav>
