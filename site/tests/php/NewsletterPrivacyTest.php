<?php
/** WordPress personal data exporter and eraser for newsletter subscribers, and the admin list with its bulk delete. */
final class NewsletterPrivacyTest extends WPTestCase {
	private function make( string $status, string $email ): int {
		return (int) wp_insert_post( array( 'post_type' => 'ita_subscriber', 'post_status' => 'private', 'post_title' => $email, 'meta_input' => array( 'email' => $email, 'consent_at' => '2026-03-01T09:00:00+00:00', 'status' => $status, 'confirmation_sent_at' => time() ) ) );
	}

	public function test_exporter_and_eraser_are_registered_with_wordpress(): void {
		$ex = apply_filters( 'wp_privacy_personal_data_exporters', array() );
		$er = apply_filters( 'wp_privacy_personal_data_erasers', array() );
		$this->assertTrue( is_callable( $ex['ideatoapps-newsletter']['callback'] ) );
		$this->assertTrue( is_callable( $er['ideatoapps-newsletter']['callback'] ) );
		$this->assertNotSame( '', $ex['ideatoapps-newsletter']['exporter_friendly_name'] );
		$this->assertNotSame( '', $er['ideatoapps-newsletter']['eraser_friendly_name'] );
	}

	public function test_exporter_returns_what_is_stored_for_that_email_only(): void {
		$this->make( 'confirmed', 'me@example.com' );
		$this->make( 'pending', 'other@example.com' );
		$res  = ideatoapps_newsletter_privacy_export( 'ME@Example.com' );
		$this->assertTrue( $res['done'] );
		$this->assertCount( 1, $res['data'] );
		$flat = wp_json_encode( $res['data'] );
		$this->assertStringContainsString( 'me@example.com', $flat );
		$this->assertStringContainsString( 'confirmed', $flat );
		$this->assertStringContainsString( '2026-03-01T09:00:00', $flat );
		$this->assertStringNotContainsString( 'other@example.com', $flat );
		$this->assertSame( array(), ideatoapps_newsletter_privacy_export( 'nobody@example.com' )['data'] );
	}

	public function test_eraser_hard_deletes_the_row_and_its_meta_and_nothing_else(): void {
		global $wpdb;
		$mine  = $this->make( 'unsubscribed', 'me@example.com' );
		$other = $this->make( 'confirmed', 'other@example.com' );
		$res   = ideatoapps_newsletter_privacy_erase( 'Me@Example.com' );
		$this->assertTrue( $res['items_removed'] );
		$this->assertFalse( $res['items_retained'] );
		$this->assertTrue( $res['done'] );
		$this->assertNull( get_post( $mine ), 'deleted, not trashed' );
		$this->assertSame( 0, (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE post_id = %d", $mine ) ) );
		$this->assertNotNull( get_post( $other ) );
		$none = ideatoapps_newsletter_privacy_erase( 'me@example.com' );
		$this->assertFalse( $none['items_removed'] );
		$this->assertFalse( $none['items_retained'] );
	}

	public function test_the_core_eraser_flow_reaches_it(): void {
		$id = $this->make( 'pending', 'flow@example.com' );
		$er = apply_filters( 'wp_privacy_personal_data_erasers', array() );
		call_user_func( $er['ideatoapps-newsletter']['callback'], 'flow@example.com', 1 );
		$this->assertNull( get_post( $id ) );
	}

	public function test_bulk_delete_needs_manage_options_and_a_nonce(): void {
		$this->assertFalse( ideatoapps_can_delete_subscribers( 'x' ) );
		wp_set_current_user( self::make_user( 'editor' ) );
		$this->assertFalse( ideatoapps_can_delete_subscribers( wp_create_nonce( 'ideatoapps_delete_subscribers' ) ) );
		wp_set_current_user( self::make_user( 'administrator' ) );
		$this->assertFalse( ideatoapps_can_delete_subscribers( 'bad' ) );
		$this->assertTrue( ideatoapps_can_delete_subscribers( wp_create_nonce( 'ideatoapps_delete_subscribers' ) ) );
	}

	public function test_delete_helper_is_permanent_and_only_touches_subscriber_rows(): void {
		$a    = $this->make( 'confirmed', 'a@example.com' );
		$b    = $this->make( 'pending', 'b@example.com' );
		$page = wp_insert_post( array( 'post_type' => 'page', 'post_title' => 'Keep me', 'post_status' => 'publish' ) );
		$this->assertSame( 2, ideatoapps_delete_subscribers( array( $a, $b, $page, 0, 999999 ) ) );
		$this->assertNull( get_post( $a ) );
		$this->assertNull( get_post( $b ) );
		$this->assertNotNull( get_post( $page ) );
	}

	public function test_admin_page_lists_every_status_with_counts_and_a_bulk_delete_form(): void {
		$this->make( 'confirmed', 'c@example.com' );
		$this->make( 'pending', 'p@example.com' );
		$this->make( 'unsubscribed', 'u@example.com' );
		wp_set_current_user( self::make_user( 'administrator' ) );
		ob_start();
		ideatoapps_render_export_page();
		$html = (string) ob_get_clean();
		foreach ( array( 'c@example.com', 'p@example.com', 'u@example.com' ) as $e ) {
			$this->assertStringContainsString( $e, $html );
		}
		$this->assertStringContainsString( 'Confirmed: 1. Pending (not yet confirmed): 1. Unsubscribed: 1.', $html );
		$this->assertStringContainsString( 'Delete permanently', $html );
		$this->assertStringContainsString( 'ideatoapps_delete_subscribers', $html );
		$this->assertStringContainsString( 'Do not mail anyone from this list', $html );
		$this->assertStringContainsString( 'G1', $html );
		$this->assertStringContainsString( 'SPF', $html );
		$this->assertStringContainsString( 'no composer', $html );
	}
}
