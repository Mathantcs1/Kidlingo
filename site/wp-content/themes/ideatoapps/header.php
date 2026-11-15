<?php
/**
 * Site header: skip link, wordmark, primary nav, theme toggle, mobile drawer.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
$signin = home_url( '/my-account/' );
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="color-scheme" content="dark light">
	<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="skip-link" href="#main" data-inert-when-menu><?php esc_html_e( 'Skip to content', 'ideatoapps' ); ?></a>

<header class="site-header" data-inert-when-menu>
	<div class="container site-header__inner">
		<a class="wordmark" href="<?php echo esc_url( home_url( '/' ) ); ?>" rel="home">Idea<span>To</span>Apps</a>

		<nav class="nav-primary" aria-label="<?php esc_attr_e( 'Primary', 'ideatoapps' ); ?>">
			<ul><?php ideatoapps_render_links( ideatoapps_primary_links() ); ?></ul>
		</nav>

		<button type="button" class="icon-btn theme-toggle" data-theme-toggle data-testid="theme-toggle" aria-label="<?php esc_attr_e( 'Switch colour theme', 'ideatoapps' ); ?>">
			<svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
			<svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
		</button>

		<?php ideatoapps_part( 'button', array( 'label' => __( 'Sign in', 'ideatoapps' ), 'href' => $signin, 'variant' => 'secondary', 'size' => 'sm', 'class' => 'site-header__signin' ) ); ?>

		<button type="button" class="icon-btn menu-button" data-menu-button data-testid="menu-button" aria-label="<?php esc_attr_e( 'Open menu', 'ideatoapps' ); ?>" aria-expanded="false" aria-controls="nav-drawer">
			<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
		</button>
	</div>
</header>

<div class="nav-drawer" id="nav-drawer" data-nav-drawer data-testid="nav-drawer" role="dialog" aria-modal="true" aria-label="<?php esc_attr_e( 'Menu', 'ideatoapps' ); ?>">
	<div class="nav-drawer__head">
		<span class="nav-drawer__title" aria-hidden="true"><?php esc_html_e( 'Menu', 'ideatoapps' ); ?></span>
		<button type="button" class="icon-btn" data-nav-close data-testid="nav-close" aria-label="<?php esc_attr_e( 'Close menu', 'ideatoapps' ); ?>">
			<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>
		</button>
	</div>
	<nav aria-label="<?php esc_attr_e( 'Mobile', 'ideatoapps' ); ?>">
		<ul class="nav-drawer__list">
			<?php ideatoapps_render_links( ideatoapps_primary_links() ); ?>
			<li><a href="<?php echo esc_url( $signin ); ?>"><?php esc_html_e( 'Sign in', 'ideatoapps' ); ?></a></li>
		</ul>
	</nav>
</div>

<main id="main" class="site-main" tabindex="-1" data-inert-when-menu>
