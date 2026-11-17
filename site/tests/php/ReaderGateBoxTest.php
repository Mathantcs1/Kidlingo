<?php
/**
 * The "Subscribers only" box in the post editor: the only way (with the installer) to write `ita_gated`; it never weakens the
 * human review gate. Also: only the six owner-approved starter articles are gated in their headers.
 */
final class ReaderGateBoxTest extends WPTestCase {
	private int $admin = 0;

	protected function setUp(): void {
		parent::setUp();
		$this->admin = self::make_user( 'administrator' );
		wp_set_current_user( $this->admin );
	}

	protected function tearDown(): void {
		$_POST = array();
		parent::tearDown();
	}

	private function post( array $over = array() ): int {
		return (int) wp_insert_post( $over + array( 'post_title' => 'Box', 'post_status' => 'draft', 'post_content' => '<p>Body</p>' ) );
	}

	private function box( int $id ): string {
		ob_start();
		ideatoapps_gate_render_box( get_post( $id ) );
		return (string) ob_get_clean();
	}

	private function form( int $id, bool $ticked, array $over = array() ): array {
		return $over + array( 'ita_gate_nonce' => wp_create_nonce( 'ita_gate_' . $id ), 'ita_gate_present' => '1' ) + ( $ticked ? array( 'ita_gated' => '1' ) : array() );
	}

	public function test_the_box_shows_the_checkbox_its_state_a_nonce_and_says_when_it_has_no_effect(): void {
		$id   = $this->post();
		$html = $this->box( $id );
		$this->assertStringContainsString( 'Subscribers only', $html );
		$this->assertMatchesRegularExpression( '/<input type="checkbox" name="ita_gated" value="1"(?![^>]*checked)[^>]*>/', $html );
		$this->assertStringContainsString( 'name="ita_gate_nonce"', $html );
		$this->assertStringContainsString( 'newsletter sign-up is switched off', $html );
		update_post_meta( $id, 'ita_gated', 1 );
		update_option( 'ideatoapps_newsletter_enabled', true );
		$html = $this->box( $id );
		$this->assertMatchesRegularExpression( '/name="ita_gated" value="1"[^>]*checked/', $html );
		$this->assertStringNotContainsString( 'newsletter sign-up is switched off', $html );
	}

	public function test_saving_with_the_nonce_stores_one_or_zero(): void {
		$id = $this->post();
		ideatoapps_gate_save_box( $id, $this->form( $id, true ) );
		$this->assertSame( '1', (string) get_post_meta( $id, 'ita_gated', true ) );
		ideatoapps_gate_save_box( $id, $this->form( $id, false ) );
		$this->assertSame( '0', (string) get_post_meta( $id, 'ita_gated', true ) );
	}

	public function test_no_nonce_a_wrong_nonce_no_box_or_no_capability_changes_nothing(): void {
		$id = $this->post();
		update_post_meta( $id, 'ita_gated', 1 );
		ideatoapps_gate_save_box( $id, array( 'ita_gate_present' => '1' ) );
		ideatoapps_gate_save_box( $id, $this->form( $id, false, array( 'ita_gate_nonce' => wp_create_nonce( 'ita_gate_' . ( $id + 1 ) ) ) ) );
		ideatoapps_gate_save_box( $id, array( 'ita_gate_nonce' => wp_create_nonce( 'ita_gate_' . $id ) ) );
		wp_set_current_user( self::make_user( 'contributor' ) );
		ideatoapps_gate_save_box( $id, $this->form( $id, false ) );
		$this->assertSame( '1', (string) get_post_meta( $id, 'ita_gated', true ) );
	}

	public function test_the_real_save_post_hook_reads_the_submitted_form(): void {
		$id    = $this->post();
		$_POST = $this->form( $id, true );
		wp_update_post( array( 'ID' => $id, 'post_title' => 'Saved' ) );
		$this->assertSame( '1', (string) get_post_meta( $id, 'ita_gated', true ) );
	}

	public function test_the_meta_is_protected_from_rest_custom_fields_and_xml_rpc(): void {
		$id = $this->post( array( 'post_status' => 'publish' ) );
		$this->assertTrue( is_protected_meta( 'ita_gated', 'post' ) );
		$this->assertFalse( current_user_can( 'edit_post_meta', $id, 'ita_gated' ) );
		$this->assertFalse( current_user_can( 'add_post_meta', $id, 'ita_gated' ) );
		$req = new WP_REST_Request( 'POST', "/wp/v2/posts/{$id}" );
		$req->set_body_params( array( 'meta' => array( 'ita_gated' => 1 ) ) );
		rest_do_request( $req );
		$this->assertSame( '', (string) get_post_meta( $id, 'ita_gated', true ) );
	}

	public function test_the_box_never_weakens_the_review_gate(): void {
		$id = $this->post();
		update_post_meta( $id, 'ita_starter_slug', '08-your-first-week-with-ai' );
		update_post_meta( $id, 'ita_review_status', 'ai_draft' );
		$_POST = $this->form( $id, true ) + array( 'post_ID' => (string) $id );
		wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
		$this->assertSame( 'draft', get_post_status( $id ), 'an unreviewed starter post still cannot go live' );
		$this->assertSame( '1', (string) get_post_meta( $id, 'ita_gated', true ) );
		$this->assertSame( 'ai_draft', ideatoapps_review_status( $id ) );
	}

	public function test_only_the_six_owner_approved_articles_are_gated_in_their_headers(): void {
		$gated = array();
		foreach ( ideatoapps_blog_article_files() as $path ) {
			$a = ideatoapps_blog_parse_article( $path );
			if ( is_array( $a ) && $a['gated'] ) {
				$gated[] = substr( $a['slug'], 0, 2 );
			}
		}
		sort( $gated );
		$this->assertSame( array( '08', '14', '32', '36', '42', '44' ), $gated );
	}

	public function test_the_installer_seeds_the_box_from_the_header(): void {
		$this->assertTrue( function_exists( 'ideatoapps_blog_write_meta' ) );
		$id = $this->post();
		ideatoapps_blog_write_meta( $id, array( 'slug' => '08-x', 'reviewed' => '2026-01-01', 'gated' => true, 'check' => array(), 'level' => 'beginner', 'audiences' => array( 'beginners' ) ) );
		$this->assertSame( '1', (string) get_post_meta( $id, 'ita_gated', true ) );
		$this->assertMatchesRegularExpression( '/name="ita_gated" value="1"[^>]*checked/', $this->box( $id ) );
	}
}
