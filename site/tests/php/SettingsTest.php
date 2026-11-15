<?php
final class SettingsTest extends WPTestCase {
	private function user( string $role ): int {
		return wp_insert_user( array( 'user_login' => 'u_' . $role . wp_generate_password( 4, false ), 'user_pass' => 'x', 'role' => $role ) );
	}

	private function app( string $status = 'publish' ): int {
		return wp_insert_post( array( 'post_type' => 'app', 'post_title' => 'App', 'post_status' => $status ) );
	}

	private function post( array $fields ): array {
		return $fields + array( '_wpnonce' => wp_create_nonce( 'ideatoapps_save_settings' ) );
	}

	protected function tearDown(): void {
		delete_option( 'ideatoapps_featured_app_ids' );
		delete_option( 'ideatoapps_youtube_channel_url' );
		parent::tearDown();
	}

	public function test_admin_saves_featured_ids_and_channel(): void {
		$a = $this->app();
		$b = $this->app();
		wp_set_current_user( $this->user( 'administrator' ) );
		$result = ideatoapps_process_settings( $this->post( array( 'featured_app_ids' => array( (string) $b, (string) $a ), 'youtube_channel_url' => 'https://www.youtube.com/@ideatoapps' ) ) );
		$this->assertSame( array(), $result['errors'] );
		$this->assertSame( array( $b, $a ), get_option( 'ideatoapps_featured_app_ids' ), 'order is kept' );
		$this->assertSame( 'https://www.youtube.com/@ideatoapps', get_option( 'ideatoapps_youtube_channel_url' ) );
	}

	public function test_user_without_manage_options_cannot_save(): void {
		update_option( 'ideatoapps_youtube_channel_url', 'https://example.org/keep' );
		foreach ( array( 'subscriber', 'editor', 'shop_manager' ) as $role ) {
			wp_set_current_user( $this->user( $role ) );
			$result = ideatoapps_process_settings( $this->post( array( 'featured_app_ids' => array( (string) $this->app() ), 'youtube_channel_url' => 'https://evil.example/x' ) ) );
			$this->assertSame( 'forbidden', $result['status'], $role );
		}
		wp_set_current_user( 0 );
		$this->assertSame( 'forbidden', ideatoapps_process_settings( $this->post( array() ) )['status'] );
		$this->assertSame( 'https://example.org/keep', get_option( 'ideatoapps_youtube_channel_url' ) );
		$this->assertSame( array(), get_option( 'ideatoapps_featured_app_ids' ) );
	}

	public function test_bad_nonce_is_refused(): void {
		wp_set_current_user( $this->user( 'administrator' ) );
		$result = ideatoapps_process_settings( array( '_wpnonce' => 'nope', 'youtube_channel_url' => 'https://example.org/x' ) );
		$this->assertSame( 'bad_nonce', $result['status'] );
		$this->assertSame( '', get_option( 'ideatoapps_youtube_channel_url' ) );
		$result = ideatoapps_process_settings( array( 'youtube_channel_url' => 'https://example.org/x' ) );
		$this->assertSame( 'bad_nonce', $result['status'] );
	}

	public function test_invalid_url_is_rejected_with_a_notice_and_old_value_kept(): void {
		wp_set_current_user( $this->user( 'administrator' ) );
		update_option( 'ideatoapps_youtube_channel_url', 'https://example.org/old' );
		foreach ( array( 'javascript:alert(1)', 'ftp://example.org/x', 'not a url', 'example.org/no-scheme', 'http://', '//evil.example/x', 'data:text/html,hi' ) as $bad ) {
			$result = ideatoapps_process_settings( $this->post( array( 'youtube_channel_url' => $bad ) ) );
			$this->assertSame( 'ok', $result['status'], $bad );
			$this->assertSame( array( 'invalid_url' ), array_keys( $result['errors'] ), $bad );
			$this->assertNotSame( '', $result['errors']['invalid_url'] );
			$this->assertSame( 'https://example.org/old', get_option( 'ideatoapps_youtube_channel_url' ), $bad );
		}
	}

	public function test_empty_url_clears_the_setting(): void {
		wp_set_current_user( $this->user( 'administrator' ) );
		update_option( 'ideatoapps_youtube_channel_url', 'https://example.org/old' );
		$result = ideatoapps_process_settings( $this->post( array( 'youtube_channel_url' => '   ' ) ) );
		$this->assertSame( array(), $result['errors'] );
		$this->assertSame( '', get_option( 'ideatoapps_youtube_channel_url' ) );
	}

	public function test_featured_ids_keep_only_published_apps_without_duplicates(): void {
		$ok    = $this->app();
		$draft = $this->app( 'draft' );
		$post  = wp_insert_post( array( 'post_type' => 'post', 'post_title' => 'Blog', 'post_status' => 'publish' ) );
		wp_set_current_user( $this->user( 'administrator' ) );
		ideatoapps_process_settings( $this->post( array( 'featured_app_ids' => array( (string) $ok, (string) $ok, (string) $draft, (string) $post, 'abc', '0', '-3' ) ) ) );
		$this->assertSame( array( $ok ), get_option( 'ideatoapps_featured_app_ids' ) );
		ideatoapps_process_settings( $this->post( array() ) );
		$this->assertSame( array(), get_option( 'ideatoapps_featured_app_ids' ), 'nothing selected clears the list' );
	}

	public function test_settings_page_escapes_output_and_has_nonce(): void {
		wp_set_current_user( $this->user( 'administrator' ) );
		$id = wp_insert_post( array( 'post_type' => 'app', 'post_title' => 'X"><script>alert(1)</script>', 'post_status' => 'publish' ) );
		update_option( 'ideatoapps_youtube_channel_url', 'https://example.org/a"onfocus="x' );
		ob_start();
		ideatoapps_render_settings_page();
		$html = (string) ob_get_clean();
		$this->assertStringNotContainsString( '<script>alert(1)', $html );
		$this->assertStringNotContainsString( '"onfocus="x', $html );
		$this->assertStringContainsString( 'name="_wpnonce"', $html );
		$this->assertStringContainsString( 'value="' . $id . '"', $html );
	}

	public function test_menu_registered_under_settings_for_manage_options(): void {
		wp_set_current_user( $this->user( 'administrator' ) );
		set_current_screen( 'dashboard' );
		global $menu, $submenu;
		$menu    = array();
		$submenu = array();
		do_action( 'admin_menu' );
		$slugs = array_column( $submenu['options-general.php'] ?? array(), 2 );
		$this->assertContains( 'ideatoapps-settings', $slugs );
		foreach ( $submenu['options-general.php'] as $item ) {
			if ( 'ideatoapps-settings' === $item[2] ) {
				$this->assertSame( 'manage_options', $item[1] );
			}
		}
	}
}
