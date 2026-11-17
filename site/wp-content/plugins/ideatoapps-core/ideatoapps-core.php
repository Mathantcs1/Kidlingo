<?php
/**
 * Plugin Name: IdeaToApps Core
 * Description: Custom post types, WooCommerce glue and business logic for IdeaToApps.
 * Version: 0.4.0
 * Requires PHP: 8.0
 * Text Domain: ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

define( 'IDEATOAPPS_CORE_FILE', __FILE__ );
define( 'IDEATOAPPS_CORE_DIR', plugin_dir_path( __FILE__ ) );
define( 'IDEATOAPPS_CORE_VERSION', '0.4.0' );

require_once IDEATOAPPS_CORE_DIR . 'includes/compat.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/post-type.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/notices.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/video.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/video-meta-box.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/rest-guard.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/newsletter-store.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/newsletter-token.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/newsletter-mail.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/newsletter.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/newsletter-page.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/newsletter-privacy.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/newsletter-admin.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/newsletter-export.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/contact.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/pages.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/settings.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/meta.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/versions.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/meta-box-fields.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/meta-boxes.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/activation.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/woocommerce-state.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/download-files.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/media-picker.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/entitlements.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/entitlements-grant.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/commerce-rules.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/payments-guard.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/seed-clipforge-product.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/seed-clipforge.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/seo.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/seo-site-schema.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/seo-noindex.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/seo-blog.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/seo-text.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/seo-head.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/seo-robots.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/seo-headers.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/blog-shortcode-text.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/blog-shortcodes.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/blog-article-file.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/blog-review.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/blog-review-gate.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/blog-review-box.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/blog-review-list.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/blog-installer-meta.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/blog-installer-state.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/blog-installer.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/blog-installer-admin.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/reader-cookie.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/reader-teaser.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/reader-gate.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/reader-link.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/reader-link-page.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/post-gate-box.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/seo-article.php';

register_activation_hook( __FILE__, 'ideatoapps_core_activate' );
register_deactivation_hook( __FILE__, 'ideatoapps_core_deactivate' );
