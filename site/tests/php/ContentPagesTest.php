<?php
final class ContentPagesTest extends WPTestCase {
	private function video( string $status = 'publish', array $meta = array() ): int {
		return wp_insert_post( array( 'post_type' => 'video', 'post_title' => 'Walkthrough', 'post_status' => $status, 'post_excerpt' => 'A short tour.', 'meta_input' => $meta ) );
	}

	private function render( string $part, array $args = array() ): string {
		ob_start();
		ideatoapps_part( $part, $args );
		return (string) ob_get_clean();
	}

	private function labels( array $links ): array {
		return array_column( $links, 'label' );
	}

	public function test_learn_link_only_when_a_published_video_exists(): void {
		$this->assertNotContains( 'Learn', $this->labels( ideatoapps_primary_links() ) );
		$this->assertNotContains( 'Learn', $this->labels( ideatoapps_footer_links() ) );
		$this->video( 'draft' );
		$this->assertNotContains( 'Learn', $this->labels( ideatoapps_primary_links() ) );
		$id = $this->video();
		$this->assertSame( array( 'Apps', 'Learn', 'Blog', 'About' ), $this->labels( ideatoapps_primary_links() ) );
		$this->assertContains( 'Learn', $this->labels( ideatoapps_footer_links() ) );
		wp_trash_post( $id );
		$this->assertNotContains( 'Learn', $this->labels( ideatoapps_primary_links() ) );
	}

	public function test_video_card_has_no_iframe_and_no_third_party_url_until_clicked(): void {
		$id   = $this->video( 'publish', array( 'youtube_id' => 'dQw4w9WgXcQ' ) );
		$html = $this->render( 'video-card', array( 'video' => get_post( $id ) ) );
		$this->assertStringNotContainsString( '<iframe', $html );
		$this->assertStringNotContainsString( 'youtube-nocookie.com', $html, 'the embed URL is built by JS after the click' );
		$this->assertStringNotContainsString( 'ytimg', $html );
		$this->assertStringContainsString( 'data-youtube-id="dQw4w9WgXcQ"', $html );
		$this->assertStringContainsString( '<button', $html );
		$this->assertStringContainsString( 'Walkthrough', $html );
	}

	public function test_video_without_a_youtube_id_has_no_player_button(): void {
		$id   = $this->video();
		$html = $this->render( 'video-card', array( 'video' => get_post( $id ) ) );
		$this->assertStringNotContainsString( '<button', $html );
		$this->assertStringNotContainsString( 'data-youtube-id', $html );
	}

	public function test_related_app_link_only_for_a_published_visible_app(): void {
		$app = wp_insert_post( array( 'post_type' => 'app', 'post_title' => 'Tool', 'post_status' => 'publish', 'meta_input' => array( 'delivery_status' => 'live' ) ) );
		$id  = $this->video( 'publish', array( 'related_app_id' => $app ) );
		$this->assertStringContainsString( 'Tool', $this->render( 'video-card', array( 'video' => get_post( $id ), 'show_app' => true ) ) );
		wp_update_post( array( 'ID' => $app, 'post_status' => 'draft' ) );
		$this->assertStringNotContainsString( 'Tool', $this->render( 'video-card', array( 'video' => get_post( $id ), 'show_app' => true ) ) );
	}

	public function test_extract_youtube_id_accepts_ids_and_common_urls_only(): void {
		foreach ( array( 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3', 'https://youtu.be/dQw4w9WgXcQ?si=x', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', '  dQw4w9WgXcQ ' ) as $ok ) {
			$this->assertSame( 'dQw4w9WgXcQ', ideatoapps_extract_youtube_id( $ok ), $ok );
		}
		foreach ( array( '', 'short', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)', '<b>dQw4w9WgXcQ</b>' ) as $bad ) {
			$this->assertSame( '', ideatoapps_extract_youtube_id( $bad ), $bad );
		}
	}

	public function test_video_meta_box_saves_with_nonce_and_cap_only(): void {
		$app = wp_insert_post( array( 'post_type' => 'app', 'post_title' => 'Tool', 'post_status' => 'publish' ) );
		$id  = $this->video();
		$_POST = array( 'ita_youtube_id' => 'https://youtu.be/dQw4w9WgXcQ', 'ita_related_app_id' => (string) $app );
		wp_set_current_user( self::make_user( 'administrator' ) );
		ideatoapps_save_video_meta( $id );
		$this->assertSame( '', get_post_meta( $id, 'youtube_id', true ), 'no nonce, no save' );
		$_POST['ideatoapps_video_nonce'] = wp_create_nonce( 'ideatoapps_save_video' );
		ideatoapps_save_video_meta( $id );
		$this->assertSame( 'dQw4w9WgXcQ', get_post_meta( $id, 'youtube_id', true ) );
		$this->assertSame( $app, (int) get_post_meta( $id, 'related_app_id', true ) );
		wp_set_current_user( self::make_user( 'subscriber' ) );
		$_POST['ita_youtube_id'] = 'aaaaaaaaaaa';
		ideatoapps_save_video_meta( $id );
		$this->assertSame( 'dQw4w9WgXcQ', get_post_meta( $id, 'youtube_id', true ), 'a subscriber cannot edit' );
		$_POST = array();
	}

	public function test_content_pages_exist_once_and_a_trashed_one_is_not_resurrected(): void {
		ideatoapps_ensure_pages();
		foreach ( array( 'about', 'contact', 'faq', 'privacy', 'terms', 'refund-policy', 'blog' ) as $slug ) {
			$page = get_page_by_path( $slug );
			$this->assertNotNull( $page, $slug );
			$this->assertSame( 'publish', $page->post_status );
		}
		$count = wp_count_posts( 'page' )->publish;
		ideatoapps_ensure_pages();
		$this->assertSame( $count, wp_count_posts( 'page' )->publish, 'idempotent' );
		wp_trash_post( get_page_by_path( 'faq' )->ID );
		ideatoapps_ensure_pages();
		$this->assertNull( get_page_by_path( 'faq' ), 'the owner removed it on purpose' );
	}

	public function test_plugin_version_was_bumped_so_rewrites_flush(): void {
		$this->assertTrue( version_compare( IDEATOAPPS_CORE_VERSION, '0.1.1', '>' ) );
		$this->assertSame( IDEATOAPPS_CORE_VERSION, get_plugin_data( IDEATOAPPS_CORE_FILE )['Version'] );
	}

	public function test_legal_pages_are_recognised_and_carry_the_banner_text(): void {
		foreach ( array( 'privacy', 'terms', 'refund-policy' ) as $slug ) {
			$this->assertTrue( ideatoapps_is_legal_slug( $slug ), $slug );
			$html = $this->render( 'legal-' . $slug );
			$this->assertNotSame( '', trim( $html ), $slug );
			$this->assertStringContainsString( 'owner to confirm', strtolower( $html ), $slug );
		}
		$this->assertFalse( ideatoapps_is_legal_slug( 'about' ) );
		$banner = $this->render( 'draft-banner' );
		$this->assertStringContainsString( 'DRAFT, pending legal review', $banner );
	}

	public function test_faq_facts_match_the_readme_and_avoid_unbacked_claims(): void {
		$text = wp_json_encode( ideatoapps_faq_items() );
		$this->assertStringContainsString( '$24.99', $text );
		$this->assertStringContainsStringIgnoringCase( 'no free trial', $text );
		$this->assertStringContainsStringIgnoringCase( 'Python 3', $text );
		$this->assertStringContainsStringIgnoringCase( 'Safari', $text );
		$this->assertDoesNotMatchRegularExpression( '/\b(Edge|Windows|macOS|Linux|account library|refund within|\d+-day)\b/i', $text );
	}
}
