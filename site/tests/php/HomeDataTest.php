<?php
final class HomeDataTest extends WPTestCase {
	private function app( string $title, string $status = 'publish', string $delivery = 'live', array $extra = array() ): int {
		return wp_insert_post( array( 'post_type' => 'app', 'post_title' => $title, 'post_status' => $status, 'meta_input' => array( 'delivery_status' => $delivery ) + $extra ) );
	}

	private function titles( array $posts ): array {
		return array_map( static fn( $p ) => $p->post_title, $posts );
	}

	private function render( string $part ): string {
		ob_start();
		ideatoapps_part( $part );
		return (string) ob_get_clean();
	}

	protected function tearDown(): void {
		delete_option( 'ideatoapps_featured_app_ids' );
		delete_option( 'ideatoapps_youtube_channel_url' );
		parent::tearDown();
	}

	public function test_only_published_live_or_coming_soon_apps_are_listed(): void {
		$this->app( 'Live' );
		$this->app( 'Soon', 'publish', 'coming_soon' );
		$this->app( 'Hidden by status', 'publish', 'draft' );
		$this->app( 'Unpublished', 'draft', 'live' );
		$this->app( 'Private', 'private', 'live' );
		$this->app( 'Trashed', 'trash', 'live' );
		wp_insert_post( array( 'post_type' => 'app', 'post_title' => 'No delivery meta', 'post_status' => 'publish' ) );
		$titles = $this->titles( ideatoapps_featured_apps() );
		sort( $titles );
		$this->assertSame( array( 'Live', 'Soon' ), $titles );
	}

	public function test_latest_apps_when_no_featured_option(): void {
		for ( $i = 1; $i <= 8; $i++ ) {
			wp_insert_post( array( 'post_type' => 'app', 'post_title' => "App $i", 'post_status' => 'publish', 'post_date' => "2026-01-0$i 10:00:00", 'meta_input' => array( 'delivery_status' => 'live' ) ) );
		}
		$this->assertSame( array( 'App 8', 'App 7', 'App 6', 'App 5', 'App 4', 'App 3' ), $this->titles( ideatoapps_featured_apps() ) );
	}

	public function test_featured_option_wins_in_title_order_and_still_filters_drafts(): void {
		$a     = $this->app( 'A' );
		$b     = $this->app( 'B' );
		$c     = $this->app( 'C' );
		$draft = $this->app( 'D', 'publish', 'draft' );
		$trash = $this->app( 'E', 'trash' );
		$this->app( 'Latest but not featured' );
		update_option( 'ideatoapps_featured_app_ids', array( $c, $draft, $a, $trash, 999999 ) );
		$this->assertSame( array( 'A', 'C' ), $this->titles( ideatoapps_featured_apps() ) );
		unset( $b );
	}

	public function test_stale_featured_option_falls_back_to_latest(): void {
		$this->app( 'Latest' );
		update_option( 'ideatoapps_featured_app_ids', array( 999999 ) );
		$this->assertSame( array( 'Latest' ), $this->titles( ideatoapps_featured_apps() ) );
	}

	public function test_no_apps_means_empty_and_featured_part_is_absent(): void {
		$this->assertSame( array(), ideatoapps_featured_apps() );
		$this->assertSame( '', trim( $this->render( 'featured-apps' ) ) );
		$this->app( 'Hidden', 'publish', 'draft' );
		$this->assertSame( '', trim( $this->render( 'featured-apps' ) ), 'a draft app must not produce an empty section' );
	}

	public function test_live_card_shows_price_never_free_and_coming_soon_shows_no_price(): void {
		$this->app( 'ClipForge', 'publish', 'live', array( 'price_label' => '$24.99 one-time', 'tagline' => 'Edit video in your browser' ) );
		$this->app( 'Later', 'publish', 'coming_soon', array( 'price_label' => '$9.99 one-time' ) );
		$this->app( 'No price', 'publish', 'live' );
		$html = $this->render( 'featured-apps' );
		$this->assertStringContainsString( '$24.99 one-time', $html );
		$this->assertStringContainsString( 'Coming soon', $html );
		$this->assertStringNotContainsString( '$9.99', $html );
		$this->assertStringNotContainsStringIgnoringCase( 'free', $html );
	}

	public function test_categories_only_with_visible_apps(): void {
		$tool  = wp_insert_term( 'Video', 'app_category' )['term_id'];
		$empty = wp_insert_term( 'Empty', 'app_category' )['term_id'];
		$draft = wp_insert_term( 'Only drafts', 'app_category' )['term_id'];
		$a     = $this->app( 'A' );
		$b     = $this->app( 'B', 'publish', 'coming_soon' );
		$d     = $this->app( 'D', 'draft', 'live' );
		$h     = $this->app( 'H', 'publish', 'draft' );
		wp_set_object_terms( $a, array( $tool ), 'app_category' );
		wp_set_object_terms( $b, array( $tool ), 'app_category' );
		wp_set_object_terms( $d, array( $draft ), 'app_category' );
		wp_set_object_terms( $h, array( $draft ), 'app_category' );
		$cats = ideatoapps_home_categories();
		$this->assertSame( array( 'Video' ), array_map( static fn( $c ) => $c['term']->name, $cats ) );
		$this->assertSame( 2, $cats[0]['count'] );
		unset( $empty );
	}

	public function test_categories_part_absent_without_categories(): void {
		$this->app( 'Uncategorised' );
		$this->assertSame( '', trim( $this->render( 'categories' ) ) );
	}

	public function test_videos_helper_and_watch_learn_part(): void {
		$this->assertFalse( ideatoapps_has_published_video() );
		update_option( 'ideatoapps_youtube_channel_url', 'https://www.youtube.com/@x' );
		$this->assertSame( '', trim( $this->render( 'watch-learn' ) ), 'a channel URL alone is not content' );
		wp_insert_post( array( 'post_type' => 'video', 'post_title' => 'Draft video', 'post_status' => 'draft' ) );
		$this->assertFalse( ideatoapps_has_published_video() );
		wp_insert_post( array( 'post_type' => 'video', 'post_title' => 'First look', 'post_status' => 'publish' ) );
		$this->assertTrue( ideatoapps_has_published_video() );
		$html = $this->render( 'watch-learn' );
		$this->assertStringContainsString( 'First look', $html );
		$this->assertStringContainsString( 'https://www.youtube.com/@x', $html );
		$this->assertStringNotContainsString( 'Draft video', $html );
		delete_option( 'ideatoapps_youtube_channel_url' );
		$this->assertStringNotContainsString( 'youtube.com', $this->render( 'watch-learn' ) );
	}

	public function test_newsletter_absent_by_default_and_shown_when_the_filter_says_so(): void {
		$this->assertFalse( ideatoapps_newsletter_available() );
		$this->assertSame( '', trim( $this->render( 'newsletter' ) ) );
		add_filter( 'ideatoapps_newsletter_available', '__return_true' );
		$this->assertTrue( ideatoapps_newsletter_available() );
		$html = $this->render( 'newsletter' );
		$this->assertStringContainsString( 'type="email"', $html );
		$this->assertStringContainsString( '<label', $html );
		remove_filter( 'ideatoapps_newsletter_available', '__return_true' );
		$this->assertSame( '', trim( $this->render( 'newsletter' ) ) );
	}

	public function test_how_it_works_has_four_honest_steps(): void {
		$html = $this->render( 'how-it-works' );
		foreach ( array( 'Discover', 'Watch', 'Buy once', 'Download and run' ) as $step ) {
			$this->assertStringContainsString( $step, $html );
		}
		$this->assertStringNotContainsStringIgnoringCase( 'try', $html );
		$this->assertStringNotContainsStringIgnoringCase( 'trial', $html );
		$this->assertStringNotContainsStringIgnoringCase( 'free', $html );
		$this->assertSame( 4, substr_count( $html, '<li' ) );
	}
}
