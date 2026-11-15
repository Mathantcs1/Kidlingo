<?php
final class AppMetaBoxTest extends WPTestCase {
	protected function tearDown(): void {
		$_POST = array();
		parent::tearDown();
	}

	private function app(): int {
		return wp_insert_post( array( 'post_type' => 'app', 'post_title' => 'M', 'post_status' => 'publish', 'meta_input' => array( 'tagline' => 'orig' ) ) );
	}

	private function as_role( string $role ): void {
		wp_set_current_user( AppPostTypeTest::factory_user( $role ) );
	}

	public function test_details_saved_with_valid_nonce_and_cap(): void {
		$id = $this->app();
		$this->as_role( 'administrator' );
		$_POST = array( 'ideatoapps_details_nonce' => wp_create_nonce( 'ideatoapps_save_details' ), 'ita_tagline' => wp_slash( 'New <b>line</b>' ), 'ita_delivery_status' => 'live', 'ita_launch_url' => 'https://example.org/x' );
		ideatoapps_save_details( $id );
		$this->assertSame( 'New line', get_post_meta( $id, 'tagline', true ) );
		$this->assertSame( 'live', get_post_meta( $id, 'delivery_status', true ) );
		$this->assertSame( 'https://example.org/x', get_post_meta( $id, 'launch_url', true ) );
	}

	public function test_missing_nonce_changes_nothing(): void {
		$id = $this->app();
		$this->as_role( 'administrator' );
		$_POST = array( 'ita_tagline' => 'hacked' );
		ideatoapps_save_details( $id );
		$this->assertSame( 'orig', get_post_meta( $id, 'tagline', true ) );
	}

	public function test_invalid_nonce_changes_nothing(): void {
		$id = $this->app();
		$this->as_role( 'administrator' );
		$_POST = array( 'ideatoapps_details_nonce' => 'bad', 'ita_tagline' => 'hacked' );
		ideatoapps_save_details( $id );
		$this->assertSame( 'orig', get_post_meta( $id, 'tagline', true ) );
	}

	public function test_wrong_action_nonce_changes_nothing(): void {
		$id = $this->app();
		$this->as_role( 'administrator' );
		$_POST = array( 'ideatoapps_details_nonce' => wp_create_nonce( 'something_else' ), 'ita_tagline' => 'hacked' );
		ideatoapps_save_details( $id );
		$this->assertSame( 'orig', get_post_meta( $id, 'tagline', true ) );
	}

	public function test_user_without_edit_post_cannot_change_meta(): void {
		$id = $this->app();
		$this->as_role( 'subscriber' );
		$_POST = array( 'ideatoapps_details_nonce' => wp_create_nonce( 'ideatoapps_save_details' ), 'ita_tagline' => 'hacked' );
		ideatoapps_save_details( $id );
		$this->assertSame( 'orig', get_post_meta( $id, 'tagline', true ) );
	}

	public function test_version_added_via_metabox(): void {
		$id = $this->app();
		$this->as_role( 'administrator' );
		$_POST = array( 'ideatoapps_versions_nonce' => wp_create_nonce( 'ideatoapps_save_versions' ), 'ita_new_version' => '2.0.0', 'ita_new_changelog' => 'Big', 'ita_new_attachment' => '7' );
		ideatoapps_save_versions( $id );
		$this->assertSame( '2.0.0', ideatoapps_get_versions( $id )[0]['version'] );
	}

	public function test_version_not_added_without_nonce_or_cap(): void {
		$id = $this->app();
		$this->as_role( 'administrator' );
		$_POST = array( 'ita_new_version' => '2.0.0' );
		ideatoapps_save_versions( $id );
		$this->assertSame( array(), ideatoapps_get_versions( $id ) );
		$this->as_role( 'subscriber' );
		$_POST = array( 'ideatoapps_versions_nonce' => wp_create_nonce( 'ideatoapps_save_versions' ), 'ita_new_version' => '2.0.0' );
		ideatoapps_save_versions( $id );
		$this->assertSame( array(), ideatoapps_get_versions( $id ) );
	}

	public function test_meta_boxes_render_escaped_with_nonce(): void {
		$id = $this->app();
		update_post_meta( $id, 'tagline', 'x" onfocus="y' );
		ideatoapps_add_version( $id, '1.0.0', '</textarea><script>1</script>', 3 );
		$this->as_role( 'administrator' );
		ob_start();
		ideatoapps_render_details_box( get_post( $id ) );
		ideatoapps_render_versions_box( get_post( $id ) );
		$html = ob_get_clean();
		$this->assertStringContainsString( 'ideatoapps_details_nonce', $html );
		$this->assertStringContainsString( 'ideatoapps_versions_nonce', $html );
		$this->assertStringNotContainsString( 'x" onfocus', $html );
		$this->assertStringNotContainsString( '<script>1', $html );
	}
}
