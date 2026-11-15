<?php
/**
 * Plugin Name: IdeaToApps Core
 * Description: Custom post types, WooCommerce glue and business logic for IdeaToApps.
 * Version: 0.1.0
 * Requires PHP: 8.0
 * Text Domain: ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

define( 'IDEATOAPPS_CORE_FILE', __FILE__ );
define( 'IDEATOAPPS_CORE_DIR', plugin_dir_path( __FILE__ ) );
define( 'IDEATOAPPS_CORE_VERSION', '0.1.0' );

require_once IDEATOAPPS_CORE_DIR . 'includes/post-type.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/notices.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/meta.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/versions.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/meta-box-fields.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/meta-boxes.php';
require_once IDEATOAPPS_CORE_DIR . 'includes/activation.php';

register_activation_hook( __FILE__, 'ideatoapps_core_activate' );
register_deactivation_hook( __FILE__, 'ideatoapps_core_deactivate' );
