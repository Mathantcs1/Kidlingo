<?php
use PHPUnit\Framework\TestCase;

final class ScaffoldTest extends TestCase {
	public function test_plugin_and_theme_headers_exist(): void {
		$root = dirname( __DIR__, 2 ) . '/wp-content';
		$this->assertStringContainsString( 'Plugin Name: IdeaToApps Core', file_get_contents( "$root/plugins/ideatoapps-core/ideatoapps-core.php" ) );
		$this->assertStringContainsString( 'Theme Name: IdeaToApps', file_get_contents( "$root/themes/ideatoapps/style.css" ) );
	}
}
