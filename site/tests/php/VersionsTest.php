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
}
