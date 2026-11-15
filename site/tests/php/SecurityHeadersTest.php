<?php
require_once __DIR__ . '/WPTestCase.php';

final class SecurityHeadersTest extends WPTestCase {
	protected function tearDown(): void {
		remove_all_filters( 'ideatoapps_security_headers' );
		parent::tearDown();
	}

	public function test_safe_header_subset(): void {
		$h = ideatoapps_security_headers();
		$this->assertSame( 'nosniff', $h['X-Content-Type-Options'] );
		$this->assertSame( 'strict-origin-when-cross-origin', $h['Referrer-Policy'] );
		$this->assertSame( 'SAMEORIGIN', $h['X-Frame-Options'] );
		$this->assertArrayNotHasKey( 'Strict-Transport-Security', $h, 'HSTS is a documented opt-in, never sent from PHP' );
		$this->assertArrayNotHasKey( 'Content-Security-Policy', $h, 'a CSP would break Stripe and WooCommerce scripts' );
	}

	public function test_headers_are_hooked_to_send_headers_and_filterable(): void {
		$this->assertNotFalse( has_action( 'send_headers', 'ideatoapps_send_security_headers' ) );
		add_filter( 'ideatoapps_security_headers', static fn( array $h ): array => $h + array( 'X-Test' => '1' ) );
		$this->assertSame( '1', ideatoapps_security_headers()['X-Test'] );
	}

	public function test_header_values_cannot_inject_new_lines(): void {
		add_filter( 'ideatoapps_security_headers', static fn( array $h ): array => array( 'X-Bad' => "a\r\nSet-Cookie: x=1", "X-Evil\nY" => 'v' ) );
		$h = ideatoapps_security_headers();
		$this->assertSame( array( 'X-Bad' => 'aSet-Cookie: x=1' ), $h );
	}
}
