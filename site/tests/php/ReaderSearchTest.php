<?php
require_once __DIR__ . '/ReaderTestCase.php';

/**
 * Search must not work as an oracle on a gated body: for a visitor (no edit right, no reader cookie) and while the switch is on, a
 * gated post matches only on its title and excerpt, in the front-end search, the blog `?q=`, REST /wp/v2/posts?search= and
 * /wp/v2/search. Readers and editors still find it by its body; open posts are unaffected.
 */
final class ReaderSearchTest extends ReaderTestCase {
	/** A phrase only in the gated body of article 08. */
	private const BODY = 'Scroll through the week';

	private function found_ids( array $args ): array {
		$q = new WP_Query( $args + array( 'post_type' => 'post', 'post_status' => 'publish', 'fields' => 'ids', 'posts_per_page' => 20 ) );
		return array_map( 'intval', $q->posts );
	}

	private function rest_ids( string $route, array $params ): array {
		$req = new WP_REST_Request( 'GET', $route );
		foreach ( $params as $k => $v ) {
			$req->set_param( $k, $v );
		}
		return array_map( static fn( $row ) => (int) $row['id'], (array) rest_do_request( $req )->get_data() );
	}

	/** Every search path, for the current visitor: ids found for a phrase. */
	private function found( string $phrase ): array {
		$all = array(
			'query'          => $this->found_ids( array( 's' => $phrase ) ),
			'quoted'         => $this->found_ids( array( 's' => '"' . $phrase . '"' ) ),
			'sentence'       => $this->found_ids( array( 's' => $phrase, 'sentence' => 1 ) ),
			'content column' => $this->found_ids( array( 's' => $phrase, 'search_columns' => array( 'post_content' ) ) ),
			'rest posts'     => $this->rest_ids( '/wp/v2/posts', array( 'search' => $phrase ) ),
			'rest search'    => $this->rest_ids( '/wp/v2/search', array( 'search' => $phrase ) ),
		);
		$this->go_to( home_url( '/?s=' . rawurlencode( $phrase ) ) );
		$all['front end'] = array_map( 'intval', wp_list_pluck( $GLOBALS['wp_query']->posts, 'ID' ) );
		return $all;
	}

	public function test_a_visitor_cannot_find_a_gated_post_by_its_body(): void {
		$id = $this->gated_post();
		foreach ( $this->found( self::BODY ) as $path => $ids ) {
			$this->assertNotContains( $id, $ids, $path );
		}
	}

	public function test_title_and_excerpt_still_match_and_ordering_ignores_the_body(): void {
		$id = $this->gated_post( '08-your-first-week-with-ai', true, 'A seven-day plan.' );
		$this->assertContains( $id, $this->found_ids( array( 's' => 'first week' ) ), 'title' );
		$this->assertContains( $id, $this->found_ids( array( 's' => 'seven-day plan' ) ), 'excerpt' );
		$this->assertContains( $id, $this->found_ids( array( 's' => 'first week -sports' ) ), 'an excluded word works' );
		$q   = new WP_Query( array( 's' => 'week scroll', 'post_type' => 'post' ) );
		$sql = $q->request;
		$all = preg_match_all( '/post_content LIKE/', $sql );
		$this->assertGreaterThan( 0, $all );
		$this->assertSame( $all, preg_match_all( '/\w+\.ID NOT IN \(' . $id . '\) AND \w+\.post_content LIKE/', $sql ), 'every body match, in the WHERE and in the relevance ORDER BY, is fenced off for gated ids' );
	}

	public function test_readers_and_editors_find_it_and_open_posts_are_unaffected(): void {
		$id   = $this->gated_post();
		$open = $this->gated_post( '14-reusable-prompt-templates', false );
		$this->assertContains( $open, $this->found_ids( array( 's' => 'Keeping templates useful' ) ), 'open post body still matches' );
		$this->with_cookie( $this->subscriber( 'confirmed' ) );
		$this->assertContains( $id, $this->found_ids( array( 's' => self::BODY ) ), 'reader' );
		$_COOKIE = array();
		wp_set_current_user( self::make_user( 'editor' ) );
		$this->assertContains( $id, $this->found_ids( array( 's' => self::BODY ) ), 'editor' );
	}

	public function test_a_pending_cookie_or_a_site_account_does_not_unlock_search_but_the_switch_off_does(): void {
		$id = $this->gated_post();
		$this->with_cookie( $this->subscriber( 'pending' ) );
		$this->assertNotContains( $id, $this->found_ids( array( 's' => self::BODY ) ), 'pending' );
		wp_set_current_user( self::make_user( 'subscriber' ) );
		$this->assertNotContains( $id, $this->found_ids( array( 's' => self::BODY ) ), 'site account' );
		update_option( 'ideatoapps_newsletter_enabled', false );
		$this->assertContains( $id, $this->found_ids( array( 's' => self::BODY ) ), 'switch off: nothing is gated' );
	}
}
