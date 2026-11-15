<?php
/**
 * Site footer.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
</main>

<footer class="site-footer" data-inert-when-menu>
	<div class="container">
		<div class="site-footer__inner">
			<div>
				<p class="wordmark"><?php ideatoapps_brand_mark(); ?>Idea<span>To</span>Apps</p>
				<p class="site-footer__tagline"><?php esc_html_e( 'Useful apps. Brilliant ideas. One place.', 'ideatoapps' ); ?></p>
			</div>
			<nav class="footer-nav" aria-label="<?php esc_attr_e( 'Footer', 'ideatoapps' ); ?>">
				<ul><?php ideatoapps_render_links( ideatoapps_footer_links() ); ?></ul>
			</nav>
		</div>
		<p class="site-footer__legal">&copy; <?php echo esc_html( gmdate( 'Y' ) ); ?> IdeaToApps</p>
	</div>
</footer>

<?php wp_footer(); ?>
</body>
</html>
