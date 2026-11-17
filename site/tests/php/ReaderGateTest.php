<?php
require_once __DIR__ . '/ReaderTestCase.php';

/**
 * Subscriber-only posts: a visitor who is not a confirmed reader gets the teaser and the subscribe card, and the gated body is in
 * none of the page, the REST API, the feed, excerpts, the meta description, oEmbed, the sitemap or search results. A confirmed
 * reader (cookie) gets the whole post. Gating is off while the newsletter switch is off.
 */
final class ReaderGateTest extends ReaderTestCase {
	public function test_a_visitor_sees_the_teaser_and_the_card_and_the_page_holds_no_gated_text(): void {
		$id   = $this->gated_post();
		$html = $this->page_html( $id );
		$this->assertStringContainsString( self::EARLY, html_entity_decode( $html ) );
		foreach ( array( 'gate-card', 'gate-teaser', 'gate-email', 'gate-link-form' ) as $testid ) {
			$this->assertStringContainsString( 'data-testid="' . $testid . '"', $html, $testid );
		}
		$this->assertNoLateText( $html, 'the page' );
		$this->assertStringNotContainsString( 'ita-quiz', $html );
		$this->assertTrue( ideatoapps_reader_is_locked( $id ) );
	}

	public function test_rest_single_and_list_hold_no_gated_text_even_with_a_reader_cookie(): void {
		$id = $this->gated_post();
		$this->with_cookie( $this->subscriber( 'confirmed' ) );
		$one = rest_do_request( new WP_REST_Request( 'GET', "/wp/v2/posts/{$id}" ) )->get_data();
		$this->assertStringContainsString( self::EARLY, html_entity_decode( $one['content']['rendered'] ) );
		$this->assertNoLateText( (string) wp_json_encode( $one ), 'REST single' );
		$list = rest_do_request( new WP_REST_Request( 'GET', '/wp/v2/posts' ) )->get_data();
		$this->assertNotEmpty( $list );
		$this->assertNoLateText( (string) wp_json_encode( $list ), 'REST list' );
		$search = new WP_REST_Request( 'GET', '/wp/v2/posts' );
		$search->set_param( 'search', 'chatbot' );
		$this->assertNoLateText( (string) wp_json_encode( rest_do_request( $search )->get_data() ), 'REST search' );
	}

	public function test_feed_content_and_excerpt_hold_no_gated_text(): void {
		$this->gated_post();
		$this->go_to( home_url( '/?feed=rss2' ) );
		$this->assertTrue( is_feed() );
		ob_start();
		while ( have_posts() ) {
			the_post();
			the_content_feed( 'rss2' );
			the_excerpt_rss();
		}
		$out = (string) ob_get_clean();
		$this->assertStringContainsString( self::EARLY, html_entity_decode( $out ) );
		$this->assertNoLateText( $out, 'the feed' );
	}

	public function test_without_a_manual_excerpt_the_excerpt_and_meta_description_come_from_the_teaser(): void {
		$id = $this->gated_post();
		$this->assertNoLateText( get_the_excerpt( $id ), 'the excerpt' );
		$this->assertStringContainsString( 'A good way to learn', get_the_excerpt( $id ) );
		$this->go_to( (string) get_permalink( $id ) );
		$head = $this->head();
		$desc = (string) $this->meta( $head, 'name', 'description' );
		$this->assertStringStartsWith( 'A good way to learn an AI chatbot', $desc );
		$this->assertSame( $desc, $this->meta( $head, 'property', 'og:description' ) );
		$this->assertNoLateText( $head, 'the head' );
		$own = $this->gated_post( '08-your-first-week-with-ai', true, 'The owner excerpt.' );
		$this->go_to( (string) get_permalink( $own ) );
		$this->assertSame( 'The owner excerpt.', $this->meta( $this->head(), 'name', 'description' ) );
	}

	public function test_oembed_embed_page_sitemap_and_search_results_hold_no_gated_text(): void {
		$id = $this->gated_post();
		$this->assertNoLateText( (string) wp_json_encode( get_oembed_response_data( $id, 600 ) ), 'oEmbed' );
		$this->go_to( (string) get_post_embed_url( $id ) );
		$this->assertTrue( is_embed() );
		ob_start();
		while ( have_posts() ) {
			the_post();
			the_excerpt_embed();
		}
		$this->assertNoLateText( (string) ob_get_clean(), 'the embed page' );
		$provider = wp_sitemaps_get_server()->registry->get_provider( 'posts' );
		$this->assertNoLateText( (string) wp_json_encode( $provider->get_url_list( 1, 'post' ) ), 'the sitemap' );
		$this->go_to( home_url( '/?s=chatbot' ) );
		$this->assertTrue( is_search() );
		ob_start();
		ideatoapps_part( 'post-list', array( 'posts' => $GLOBALS['wp_query']->posts ) ); // what index.php prints for search results.
		$found = (string) ob_get_clean();
		$this->assertStringContainsString( 'Your first week with AI', $found );
		$this->assertNoLateText( $found, 'search results' );
	}

	public function test_a_confirmed_reader_with_the_cookie_reads_the_whole_post_without_the_card(): void {
		$id = $this->gated_post();
		$this->with_cookie( $this->subscriber( 'confirmed' ) );
		$html = $this->page_html( $id );
		$this->assertHasLateText( $html, 'the reader page' );
		$this->assertStringNotContainsString( 'data-testid="gate-card"', $html );
		$this->assertFalse( ideatoapps_reader_is_locked( $id ) );
	}

	public function test_pending_unsubscribed_erased_and_tampered_readers_stay_locked(): void {
		$id = $this->gated_post();
		foreach ( array( 'pending', 'unsubscribed' ) as $i => $status ) {
			$this->with_cookie( $this->subscriber( $status, "l{$i}@example.com" ) );
			$this->assertNoLateText( $this->page_html( $id ), $status );
		}
		$sid = $this->subscriber( 'confirmed', 'erase@example.com' );
		$this->with_cookie( $sid );
		$_COOKIE['ita_reader'] = substr( $_COOKIE['ita_reader'], 0, -1 ) . ( str_ends_with( $_COOKIE['ita_reader'], '0' ) ? '1' : '0' );
		$this->assertNoLateText( $this->page_html( $id ), 'tampered' );
		$this->with_cookie( $sid );
		$this->assertHasLateText( $this->page_html( $id ), 'control: the good cookie' );
		ideatoapps_newsletter_privacy_erase( 'erase@example.com' );
		$this->assertNoLateText( $this->page_html( $id ), 'erased' );
	}

	public function test_unsubscribing_locks_access_at_once(): void {
		$id  = $this->gated_post();
		$sid = $this->subscriber( 'confirmed' );
		$this->with_cookie( $sid );
		$this->assertHasLateText( $this->page_html( $id ), 'before' );
		parse_str( (string) wp_parse_url( ideatoapps_newsletter_url( $sid, 'unsubscribe' ), PHP_URL_QUERY ), $q );
		$this->assertSame( 'unsubscribed', ideatoapps_newsletter_page_response( 'POST', $q, array( 'ita_do' => 'unsubscribe' ) )['view'] );
		$this->assertNoLateText( $this->page_html( $id ), 'after unsubscribing' );
	}

	public function test_gating_is_off_while_the_newsletter_switch_is_off_or_the_box_is_unticked(): void {
		$id = $this->gated_post();
		update_option( 'ideatoapps_newsletter_enabled', false );
		$html = $this->page_html( $id );
		$this->assertHasLateText( $html, 'switch off' );
		$this->assertStringNotContainsString( 'gate-card', $html );
		$this->assertStringNotContainsString( 'isAccessibleForFree', $html );
		$this->assertSame( array(), ideatoapps_reader_response_headers() );
		update_option( 'ideatoapps_newsletter_enabled', true );
		$open = $this->gated_post( '14-reusable-prompt-templates', false );
		$this->assertStringContainsString( 'Keeping templates useful', $this->page_html( $open ) );
		$this->assertSame( array(), ideatoapps_reader_response_headers() );
	}

	public function test_gated_responses_are_private_no_store_and_vary_on_cookie_for_visitors_and_readers(): void {
		$id = $this->gated_post();
		$this->go_to( (string) get_permalink( $id ) );
		$want = array( 'Cache-Control' => 'private, no-store, max-age=0', 'Vary' => 'Cookie' );
		$this->assertSame( $want, ideatoapps_reader_response_headers() );
		$this->with_cookie( $this->subscriber( 'confirmed' ) );
		$this->go_to( (string) get_permalink( $id ) );
		$this->assertSame( $want, ideatoapps_reader_response_headers() );
		$this->assertNotFalse( has_action( 'template_redirect', 'ideatoapps_reader_send_headers' ) );
	}

	public function test_json_ld_marks_the_locked_part_and_readers_get_the_plain_article(): void {
		$id = $this->gated_post();
		$this->go_to( (string) get_permalink( $id ) );
		$ld = ideatoapps_post_jsonld( $id );
		$this->assertSame( 'Article', $ld['@type'] );
		$this->assertFalse( $ld['isAccessibleForFree'] );
		$this->assertSame( array( '@type' => 'WebPageElement', 'isAccessibleForFree' => false, 'cssSelector' => '.post-gated' ), $ld['hasPart'] );
		$head = $this->head();
		$this->assertStringContainsString( '"isAccessibleForFree":false', $head );
		$this->assertNoLateText( $head, 'JSON-LD' );
		$this->assertStringContainsString( 'class="gate-card post-gated"', $this->page_html( $id ) );
		$this->with_cookie( $this->subscriber( 'confirmed' ) );
		$this->go_to( (string) get_permalink( $id ) );
		$plain = ideatoapps_post_jsonld( $id );
		$this->assertSame( 'Article', $plain['@type'] );
		$this->assertArrayNotHasKey( 'isAccessibleForFree', $plain );
		$this->assertArrayNotHasKey( 'hasPart', $plain );
	}

	public function test_a_gated_post_stays_indexable(): void {
		$id = $this->gated_post();
		$this->go_to( (string) get_permalink( $id ) );
		$head = $this->head();
		$this->assertStringNotContainsString( 'noindex', (string) $this->meta( $head, 'name', 'robots' ) );
		$this->assertMatchesRegularExpression( '/<link rel="canonical"/', $head );
	}

	public function test_people_who_can_edit_the_post_see_it_whole(): void {
		$id = $this->gated_post();
		wp_set_current_user( self::make_user( 'editor' ) );
		$this->assertFalse( ideatoapps_reader_is_locked( $id ) );
		wp_set_current_user( self::make_user( 'subscriber' ) );
		$this->assertTrue( ideatoapps_reader_is_locked( $id ), 'a site account alone is not a newsletter reader' );
	}
}
