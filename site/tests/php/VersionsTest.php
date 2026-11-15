<?php
final class VersionsTest extends WPTestCase {
	private function app(): int {
		return wp_insert_post( array( 'post_type' => 'app', 'post_title' => 'V', 'post_status' => 'publish' ) );
	}

	public function test_add_version_stores_and_orders_newest_first(): void {
		$id = $this->app();
		$this->assertTrue( ideatoapps_add_version( $id, '1.0.0', 'First', 11 ) );
		$this->assertTrue( ideatoapps_add_version( $id, '1.1.0', 'Second', 12 ) );
		$v = ideatoapps_get_versions( $id );
		$this->assertSame( '1.1.0', $v[0]['version'] );
		$this->assertSame( '1.0.0', $v[1]['version'] );
		$this->assertSame( 12, $v[0]['attachment_id'] );
		$this->assertSame( 'Second', $v[0]['changelog'] );
		$this->assertSame( gmdate( 'Y-m-d' ), $v[0]['released'] );
	}

	public function test_orders_by_semver_not_insertion(): void {
		$id = $this->app();
		foreach ( array( '1.2.0', '1.10.0', '1.9.0' ) as $ver ) {
			ideatoapps_add_version( $id, $ver, '', 1 );
		}
		$this->assertSame( array( '1.10.0', '1.9.0', '1.2.0' ), array_column( ideatoapps_get_versions( $id ), 'version' ) );
	}

	public function test_duplicate_version_rejected(): void {
		$id = $this->app();
		$this->assertTrue( ideatoapps_add_version( $id, '1.0.0', 'a', 1 ) );
		$this->assertFalse( ideatoapps_add_version( $id, '1.0.0', 'b', 2 ) );
		$this->assertCount( 1, ideatoapps_get_versions( $id ) );
	}

	public function test_non_semver_rejected(): void {
		$id = $this->app();
		foreach ( array( 'abc', '1.0', '1.0.0-beta', 'v1.0.0', '1.0.0.0', '' ) as $bad ) {
			$this->assertFalse( ideatoapps_add_version( $id, $bad, 'x', 1 ), $bad );
		}
		$this->assertSame( array(), ideatoapps_get_versions( $id ) );
	}

	public function test_rejects_non_app_post(): void {
		$page = wp_insert_post( array( 'post_type' => 'page', 'post_title' => 'P', 'post_status' => 'publish' ) );
		$this->assertFalse( ideatoapps_add_version( $page, '1.0.0', 'x', 1 ) );
	}

	public function test_changelog_sanitised(): void {
		$id = $this->app();
		ideatoapps_add_version( $id, '1.0.0', "Fixed <script>x()</script> bug\n- more", 1 );
		$this->assertStringNotContainsString( '<script', ideatoapps_get_versions( $id )[0]['changelog'] );
	}

	public function test_get_versions_empty_by_default(): void {
		$this->assertSame( array(), ideatoapps_get_versions( $this->app() ) );
	}

	public function test_backslash_changelog_round_trips(): void {
		$id  = $this->app();
		$raw = 'Fix C:\\path\\to and "quotes" \\n literal';
		ideatoapps_add_version( $id, '1.0.0', $raw, 1 );
		ideatoapps_add_version( $id, '1.1.0', 'other', 1 );
		$this->assertSame( $raw, ideatoapps_get_versions( $id )[1]['changelog'] );
		$this->assertTrue( ideatoapps_update_version( $id, '1.0.0', $raw, 2 ) );
		$this->assertSame( $raw, ideatoapps_get_versions( $id )[1]['changelog'] );
	}

	public function test_update_version_changes_changelog_and_attachment_only(): void {
		$id = $this->app();
		ideatoapps_add_version( $id, '1.0.0', 'old', 1 );
		$this->assertTrue( ideatoapps_update_version( $id, '1.0.0', 'new <b>text</b>', 9 ) );
		$v = ideatoapps_get_versions( $id );
		$this->assertCount( 1, $v );
		$this->assertSame( '1.0.0', $v[0]['version'] );
		$this->assertSame( 'new text', $v[0]['changelog'] );
		$this->assertSame( 9, $v[0]['attachment_id'] );
		$this->assertSame( gmdate( 'Y-m-d' ), $v[0]['released'] );
	}

	public function test_update_and_remove_unknown_version_return_false(): void {
		$id = $this->app();
		ideatoapps_add_version( $id, '1.0.0', 'x', 1 );
		$this->assertFalse( ideatoapps_update_version( $id, '9.9.9', 'x', 1 ) );
		$this->assertFalse( ideatoapps_remove_version( $id, '9.9.9' ) );
		$this->assertCount( 1, ideatoapps_get_versions( $id ) );
	}

	public function test_remove_then_readd_keeps_semver_order(): void {
		$id = $this->app();
		foreach ( array( '1.0.0', '1.2.0', '1.10.0' ) as $ver ) {
			ideatoapps_add_version( $id, $ver, '', 1 );
		}
		$this->assertTrue( ideatoapps_remove_version( $id, '1.2.0' ) );
		$this->assertSame( array( '1.10.0', '1.0.0' ), array_column( ideatoapps_get_versions( $id ), 'version' ) );
		$this->assertTrue( ideatoapps_add_version( $id, '1.2.0', 'again', 1 ) );
		$this->assertSame( array( '1.10.0', '1.2.0', '1.0.0' ), array_column( ideatoapps_get_versions( $id ), 'version' ) );
	}
}
