<?php
final class ActivationTest extends WPTestCase {
	private array $server = array();

	protected function setUp(): void {
		parent::setUp();
		$this->server = $_SERVER;
		global $wp_rewrite;
		$wp_rewrite->set_permalink_structure( '/%postname%/' );
		delete_option( 'rewrite_rules' );
	}

	protected function tearDown(): void {
		global $wp_rewrite;
		$_SERVER = $this->server;
		$wp_rewrite->set_permalink_structure( '' );
		if ( ! post_type_exists( 'app' ) ) {
			ideatoapps_register_app_post_type();
		}
		parent::tearDown();
	}

	private function resolve( string $path ): array {
		$_SERVER['REQUEST_URI'] = $path;
		$_SERVER['PHP_SELF']    = '/index.php';
		unset( $_SERVER['PATH_INFO'], $_SERVER['QUERY_STRING'] );
		global $wp; // Registered query vars (e.g. `app`) live on the global instance.
		$wp->parse_request();
		return $wp->query_vars;
	}

	public function test_activation_makes_archive_and_single_urls_resolve(): void {
		ideatoapps_core_activate();
		$this->assertIsArray( get_option( 'rewrite_rules' ), 'activation must persist the rules' );
		$this->assertArrayHasKey( 'apps/?$', get_option( 'rewrite_rules' ) );
		$vars = $this->resolve( '/apps/' );
		$this->assertSame( 'app', $vars['post_type'] ?? null );
		$id = wp_insert_post( array( 'post_type' => 'app', 'post_title' => 'Demo App', 'post_name' => 'demo-app', 'post_status' => 'publish' ) );
		$this->assertGreaterThan( 0, $id );
		$vars = $this->resolve( '/apps/demo-app/' );
		$this->assertSame( 'demo-app', $vars['app'] ?? null );
	}

	public function test_deactivation_flushes_rules_without_app_urls(): void {
		ideatoapps_core_activate();
		$this->assertArrayHasKey( 'apps/?$', get_option( 'rewrite_rules' ) );
		ideatoapps_core_deactivate();
		$rules = get_option( 'rewrite_rules' );
		$this->assertIsArray( $rules );
		$this->assertArrayNotHasKey( 'apps/?$', $rules );
	}

	public function test_activation_hooks_registered(): void {
		$file = WP_PLUGIN_DIR . '/ideatoapps-core/ideatoapps-core.php';
		$this->assertNotFalse( has_action( 'activate_' . plugin_basename( $file ), 'ideatoapps_core_activate' ) );
		$this->assertNotFalse( has_action( 'deactivate_' . plugin_basename( $file ), 'ideatoapps_core_deactivate' ) );
	}
}
