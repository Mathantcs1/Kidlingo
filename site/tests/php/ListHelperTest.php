<?php
require_once __DIR__ . '/WPTestCase.php';

final class ListHelperTest extends WPTestCase {
	public function test_is_list_matches_array_is_list_semantics(): void {
		$this->assertTrue( ideatoapps_is_list( array() ) );
		$this->assertTrue( ideatoapps_is_list( array( 'a', 'b' ) ) );
		$this->assertTrue( ideatoapps_is_list( array( 0 => 'a', 1 => 'b' ) ) );
		$this->assertFalse( ideatoapps_is_list( array( 1 => 'a' ) ) );
		$this->assertFalse( ideatoapps_is_list( array( 0 => 'a', 2 => 'b' ) ) );
		$this->assertFalse( ideatoapps_is_list( array( 'k' => 'v' ) ) );
		$this->assertFalse( ideatoapps_is_list( array( 1 => 'b', 0 => 'a' ) ), 'order matters, as in array_is_list' );
	}

	public function test_meta_php_does_not_call_the_php_81_function(): void {
		$src = (string) file_get_contents( IDEATOAPPS_CORE_DIR . 'includes/meta.php' );
		$this->assertStringNotContainsString( 'array_is_list(', $src );
		$this->assertSame( 1, preg_match( '/Requires PHP:\s*8\.0/', (string) file_get_contents( IDEATOAPPS_CORE_FILE ) ) );
	}
}
