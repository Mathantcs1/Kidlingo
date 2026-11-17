<?php
require_once __DIR__ . '/ReaderTestCase.php';

/**
 * Multi-page and password-protected gated posts: the teaser always comes from the start of the WHOLE post, page 2+ sends a visitor
 * back to the permalink, readers keep normal paging; a password post never leaks its body through the teaser or the description.
 */
final class ReaderPagesTest extends ReaderTestCase {
	private function paged_post(): int {
		$a    = $this->article( '08-your-first-week-with-ai' );
		$body = '<p>Opening words of page one.</p>' . "\n<!--nextpage-->\n" . '<p>SECRETPAGETWO starts the second page.</p>' . "\n" . $a['body'] . "\n<!--nextpage-->\n<p>SECRETPAGETHREE.</p>";
		$id   = (int) wp_insert_post( wp_slash( array( 'post_title' => 'Paged', 'post_name' => 'paged-gated', 'post_status' => 'publish', 'post_content' => $body ) ) );
		update_post_meta( $id, 'ita_gated', 1 );
		return $id;
	}

	private function page_n( int $id, int $n ): string {
		$this->go_to( add_query_arg( 'page', $n, (string) get_permalink( $id ) ) );
		ob_start();
		while ( have_posts() ) {
			the_post();
			ideatoapps_part( 'post-article' );
		}
		return (string) ob_get_clean();
	}

	public function test_every_page_of_a_locked_post_shows_the_same_teaser_cut_from_the_start_of_the_whole_post(): void {
		$id      = $this->paged_post();
		$teasers = array();
		foreach ( array( 1, 2, 3 ) as $n ) {
			$html = $this->page_n( $id, $n );
			$this->assertStringContainsString( 'Opening words of page one.', $html, "page {$n}" );
			$this->assertStringNotContainsString( 'SECRETPAGETHREE', $html, "page {$n}" );
			$this->assertStringNotContainsString( 'nextpage', $html, "page {$n}" );
			$this->assertNoLateText( $html, "page {$n}" );
			preg_match( '#data-testid="gate-teaser">(.*?)</div>#s', $html, $m );
			$teasers[] = $m[1] ?? '';
		}
		$this->assertNotSame( '', $teasers[0] );
		$this->assertSame( array( $teasers[0], $teasers[0], $teasers[0] ), $teasers, 'page 2 and 3 never start their own teaser' );
	}

	public function test_page_two_and_later_redirect_visitors_to_the_permalink_but_not_readers(): void {
		$id = $this->paged_post();
		$this->go_to( add_query_arg( 'page', 2, (string) get_permalink( $id ) ) );
		$this->assertSame( 2, (int) get_query_var( 'page' ) );
		$this->assertSame( get_permalink( $id ), ideatoapps_reader_page_redirect() );
		$this->go_to( (string) get_permalink( $id ) );
		$this->assertSame( '', ideatoapps_reader_page_redirect(), 'page one stays' );
		$this->assertNotFalse( has_action( 'template_redirect', 'ideatoapps_reader_redirect_pages' ) );
		$this->with_cookie( $this->subscriber( 'confirmed' ) );
		$this->go_to( add_query_arg( 'page', 2, (string) get_permalink( $id ) ) );
		$this->assertSame( '', ideatoapps_reader_page_redirect(), 'a reader pages normally' );
		$html = $this->page_n( $id, 2 );
		$this->assertStringContainsString( 'SECRETPAGETWO', $html );
		$this->assertStringNotContainsString( 'Opening words of page one.', $html );
	}

	public function test_a_password_protected_gated_post_leaks_nothing(): void {
		$id = $this->gated_post();
		wp_update_post( array( 'ID' => $id, 'post_password' => 'pw' ) );
		$this->assertTrue( post_password_required( $id ) );
		$this->assertSame( '', ideatoapps_reader_teaser_for_post( $id ) );
		$this->assertSame( '', ideatoapps_reader_teaser_text( $id ) );
		$html = $this->page_html( $id );
		$this->assertNoLateText( $html, 'password page' );
		$this->assertStringNotContainsString( self::EARLY, html_entity_decode( $html ), 'not even the opening' );
		$this->go_to( (string) get_permalink( $id ) );
		$head = $this->head();
		$this->assertStringNotContainsString( 'A good way to learn', html_entity_decode( $head ), 'description' );
		$this->assertNoLateText( (string) wp_json_encode( rest_do_request( new WP_REST_Request( 'GET', "/wp/v2/posts/{$id}" ) )->get_data() ), 'REST' );
	}
}
