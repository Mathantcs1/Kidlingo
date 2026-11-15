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

	private function post_from_stored( int $id ): array {
		$feat = json_decode( get_post_meta( $id, 'features', true ), true );
		$faq  = json_decode( get_post_meta( $id, 'faq', true ), true );
		return wp_slash( array(
			'ideatoapps_details_nonce' => wp_create_nonce( 'ideatoapps_save_details' ),
			'ita_features'             => implode( "\n", $feat ),
			'ita_faq_q'                => array_column( $faq, 'q' ),
			'ita_faq_a'                => array_column( $faq, 'a' ),
		) );
	}

	public function test_features_and_faq_survive_repeated_saves(): void {
		$id  = $this->app();
		$raw = 'Café — 24/7 "x" \\ back\\slash';
		$this->as_role( 'administrator' );
		$_POST = wp_slash( array(
			'ideatoapps_details_nonce' => wp_create_nonce( 'ideatoapps_save_details' ),
			'ita_features'             => "$raw\n\n  Second  \n",
			'ita_faq_q'                => array( "Q $raw?", '', 'Empty answer?' ),
			'ita_faq_a'                => array( "A $raw", '', '' ),
		) );
		ideatoapps_save_details( $id );
		$expected_features = array( $raw, 'Second' );
		$expected_faq      = array( array( 'q' => "Q $raw?", 'a' => "A $raw" ), array( 'q' => 'Empty answer?', 'a' => '' ) );
		$this->assertSame( $expected_features, json_decode( get_post_meta( $id, 'features', true ), true ) );
		$this->assertSame( $expected_faq, json_decode( get_post_meta( $id, 'faq', true ), true ) );
		$first_features = get_post_meta( $id, 'features', true );
		$first_faq      = get_post_meta( $id, 'faq', true );
		for ( $i = 0; $i < 2; $i++ ) { // Re-save what the form would post back.
			$_POST = $this->post_from_stored( $id );
			ideatoapps_save_details( $id );
		}
		$this->assertSame( $first_features, get_post_meta( $id, 'features', true ) );
		$this->assertSame( $first_faq, get_post_meta( $id, 'faq', true ) );
		$this->assertStringContainsString( '—', $first_features );
	}

	public function test_changelog_backslash_survives_box_saves(): void {
		$id  = $this->app();
		$raw = 'Fix C:\\dir\\file "q"';
		$this->as_role( 'administrator' );
		$nonce = wp_create_nonce( 'ideatoapps_save_versions' );
		$_POST = wp_slash( array( 'ideatoapps_versions_nonce' => $nonce, 'ita_new_version' => '1.0.0', 'ita_new_changelog' => $raw, 'ita_new_attachment' => '5' ) );
		ideatoapps_save_versions( $id );
		for ( $i = 0; $i < 2; $i++ ) {
			$_POST = wp_slash( array( 'ideatoapps_versions_nonce' => $nonce, 'ita_ver' => array( '1.0.0' => array( 'changelog' => $raw, 'attachment' => '5' ) ) ) );
			ideatoapps_save_versions( $id );
			$this->assertSame( $raw, ideatoapps_get_versions( $id )[0]['changelog'] );
		}
	}

	public function test_existing_version_edit_and_remove_via_box(): void {
		$id = $this->app();
		ideatoapps_add_version( $id, '1.0.0', 'a', 1 );
		ideatoapps_add_version( $id, '1.1.0', 'b', 2 );
		$this->as_role( 'administrator' );
		$_POST = array( 'ideatoapps_versions_nonce' => wp_create_nonce( 'ideatoapps_save_versions' ), 'ita_ver' => array(
			'1.0.0' => array( 'changelog' => 'edited', 'attachment' => '8' ),
			'1.1.0' => array( 'changelog' => 'b', 'attachment' => '2', 'remove' => '1' ),
		) );
		ideatoapps_save_versions( $id );
		$v = ideatoapps_get_versions( $id );
		$this->assertCount( 1, $v );
		$this->assertSame( 'edited', $v[0]['changelog'] );
		$this->assertSame( 8, $v[0]['attachment_id'] );
	}

	public function test_invalid_and_duplicate_version_produce_notices_once(): void {
		$id = $this->app();
		ideatoapps_add_version( $id, '1.0.0', 'a', 1 );
		$this->as_role( 'administrator' );
		$nonce = wp_create_nonce( 'ideatoapps_save_versions' );
		$_POST = array( 'ideatoapps_versions_nonce' => $nonce, 'ita_new_version' => '1.0' );
		ideatoapps_save_versions( $id );
		$_POST = array( 'ideatoapps_versions_nonce' => $nonce, 'ita_new_version' => '1.0.0' );
		ideatoapps_save_versions( $id );
		$notices = ideatoapps_pull_notices( $id );
		$this->assertCount( 2, $notices );
		$this->assertStringContainsString( "Version '1.0' was not added: use the form 1.2.3", $notices[0] );
		$this->assertStringContainsString( 'Version 1.0.0 already exists.', $notices[1] );
		$this->assertSame( array(), ideatoapps_pull_notices( $id ) );
		$this->assertCount( 1, ideatoapps_get_versions( $id ) );
	}

	public function test_boxes_render_picker_labels_and_faq_rows(): void {
		$id = $this->app();
		update_post_meta( $id, 'faq', wp_slash( wp_json_encode( array( array( 'q' => 'Why?', 'a' => 'Because' ) ) ) ) );
		update_post_meta( $id, 'features', wp_slash( wp_json_encode( array( 'One', 'Two' ) ) ) );
		ideatoapps_add_version( $id, '1.0.0', 'c', 3 );
		$this->as_role( 'administrator' );
		ob_start();
		ideatoapps_render_details_box( get_post( $id ) );
		ideatoapps_render_versions_box( get_post( $id ) );
		$html = ob_get_clean();
		$this->assertStringContainsString( 'Coming soon', $html );
		$this->assertStringContainsString( 'name="ita_faq_q[]"', $html );
		$this->assertStringContainsString( "One\nTwo", $html );
		$this->assertStringContainsString( 'Choose file', $html );
		$this->assertStringContainsString( 'ita_ver[1.0.0][remove]', $html );
		$this->assertStringNotContainsString( 'type="number"', $html );
	}

	public function test_admin_script_enqueued_only_on_app_screen(): void {
		set_current_screen( 'post' );
		get_current_screen()->post_type = 'post';
		ideatoapps_enqueue_admin( 'post.php' );
		$this->assertFalse( wp_script_is( 'ideatoapps-admin-app', 'enqueued' ) );
		get_current_screen()->post_type = 'app';
		ideatoapps_enqueue_admin( 'edit.php' );
		$this->assertFalse( wp_script_is( 'ideatoapps-admin-app', 'enqueued' ) );
		ideatoapps_enqueue_admin( 'post.php' );
		$this->assertTrue( wp_script_is( 'ideatoapps-admin-app', 'enqueued' ) );
	}
}
