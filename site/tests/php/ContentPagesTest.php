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

	public function test_draft_privacy_policy_mentions_the_hashed_rate_limit_counters_and_keeps_the_banner(): void {
		$html = $this->render( 'legal-privacy' );
		$this->assertStringContainsString( 'hash of your IP address', $html );
		$this->assertStringContainsString( 'weak', $html );
		$this->assertStringContainsString( 'owner to confirm', strtolower( $html ) );
		$this->assertStringContainsString( 'DRAFT, pending legal review', $this->render( 'draft-banner' ) );
	}

	/** Start from a site where the seed has not run and no content page exists. */
	private function forget_seeded_pages(): void {
		foreach ( array_keys( ideatoapps_content_pages() ) as $slug ) {
			$page = get_page_by_path( $slug );
			if ( $page ) {
				wp_delete_post( $page->ID, true );
			}
		}
		delete_option( 'ideatoapps_seeded_pages' );
	}

	public function test_a_page_trashed_before_the_seed_ran_is_detected_and_not_recreated(): void {
		$this->forget_seeded_pages();
		$id = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_name' => 'faq', 'post_title' => 'My FAQ', 'post_content' => 'mine' ) );
		wp_trash_post( $id );
		$this->assertSame( 'faq__trashed', get_post_field( 'post_name', $id ) );
		ideatoapps_ensure_pages();
		$live = get_posts( array( 'post_type' => 'page', 'post_status' => 'publish', 'name' => 'faq', 'numberposts' => -1 ) );
		$this->assertSame( array(), $live, 'the owner\'s trashed FAQ is not replaced by a new empty shell' );
		$this->assertContains( 'faq', (array) get_option( 'ideatoapps_seeded_pages' ), 'handled, so it is not re-checked on every request' );
	}

	public function test_a_failed_insert_does_not_mark_the_slug_as_seeded_so_the_next_request_retries(): void {
		$this->forget_seeded_pages();
		// wp_insert_post refuses the 'about' page (as it would on a database error).
		add_filter( 'wp_insert_post_empty_content', static fn( $empty, $postarr ) => isset( $postarr['post_name'] ) && 'about' === $postarr['post_name'] ? true : $empty, 10, 2 );
		ideatoapps_ensure_pages();
		$this->assertNull( get_page_by_path( 'about' ), 'precondition: the insert for about failed' );
		$this->assertNotContains( 'about', (array) get_option( 'ideatoapps_seeded_pages' ) );
		$this->assertContains( 'faq', (array) get_option( 'ideatoapps_seeded_pages' ), 'the others are done' );
		remove_all_filters( 'wp_insert_post_empty_content' );
		ideatoapps_ensure_pages();
		$this->assertNotNull( get_page_by_path( 'about' ), 'created once the failure is gone' );
	}

	public function test_blog_helper_sends_a_page_past_the_end_to_the_last_page(): void {
		$this->assertSame( 0, ideatoapps_overflow_target_page( 1, 3 ), 'page 1 is never an overflow' );
		$this->assertSame( 0, ideatoapps_overflow_target_page( 3, 3 ), 'the last page is fine' );
		$this->assertSame( 0, ideatoapps_overflow_target_page( 1, 0 ), 'an empty list on page 1 is the real empty state' );
		$this->assertSame( 3, ideatoapps_overflow_target_page( 99, 3 ) );
		$this->assertSame( 1, ideatoapps_overflow_target_page( 2, 1 ) );
		$this->assertSame( 1, ideatoapps_overflow_target_page( 5, 0 ), 'nothing at all: back to page 1' );
	}
}
