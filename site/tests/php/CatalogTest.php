<?php
final class CatalogTest extends WPTestCase {
	private function app( string $title, string $delivery = 'live', string $status = 'publish', string $date = '2026-01-01 10:00:00', array $terms = array() ): int {
		$id = wp_insert_post( array( 'post_type' => 'app', 'post_title' => $title, 'post_status' => $status, 'post_date' => $date, 'meta_input' => array( 'delivery_status' => $delivery, 'price_label' => '$1.00 one-time' ) ) );
		if ( $terms ) {
			wp_set_object_terms( $id, $terms, 'app_category' );
		}
		return $id;
	}

	private function run_query( array $req = array(), int $paged = 1 ): WP_Query {
		return new WP_Query( ideatoapps_catalog_query_args( $req + array( 'search' => '', 'category' => '', 'sort' => 'newest' ), $paged ) );
	}

	private function titles( WP_Query $q ): array {
		return wp_list_pluck( $q->posts, 'post_title' );
	}

	public function test_only_published_live_or_coming_soon_apps(): void {
		$this->app( 'Live' );
		$this->app( 'Soon', 'coming_soon' );
		$this->app( 'Delivery draft', 'draft' );
		$this->app( 'Unpublished', 'live', 'draft' );
		$this->app( 'Private', 'live', 'private' );
		wp_insert_post( array( 'post_type' => 'app', 'post_title' => 'No meta', 'post_status' => 'publish' ) );
		$titles = $this->titles( $this->run_query( array( 'sort' => 'title' ) ) );
		$this->assertSame( array( 'Live', 'Soon' ), $titles );
	}

	public function test_sort_newest_and_title_have_an_id_tiebreak(): void {
		$a = $this->app( 'Same', 'live', 'publish', '2026-02-02 10:00:00' );
		$b = $this->app( 'Same', 'live', 'publish', '2026-02-02 10:00:00' );
		$c = $this->app( 'Older', 'live', 'publish', '2026-01-01 10:00:00' );
		$this->assertSame( array( $b, $a, $c ), wp_list_pluck( $this->run_query( array( 'sort' => 'newest' ) )->posts, 'ID' ) );
		$this->assertSame( array( $c, $a, $b ), wp_list_pluck( $this->run_query( array( 'sort' => 'title' ) )->posts, 'ID' ) );
	}

	public function test_search_and_category_filter_combine(): void {
		$this->app( 'ClipForge', 'live', 'publish', '2026-01-01 10:00:00', array( 'creator' ) );
		$this->app( 'Budget Buddy', 'live', 'publish', '2026-01-02 10:00:00', array( 'utilities' ) );
		$this->app( 'Clip Counter', 'live', 'publish', '2026-01-03 10:00:00', array( 'utilities' ) );
		$this->assertCount( 2, $this->run_query( array( 'search' => 'clip' ) )->posts );
		$slug = get_term_by( 'name', 'utilities', 'app_category' )->slug;
		$this->assertSame( array( 'Clip Counter', 'Budget Buddy' ), $this->titles( $this->run_query( array( 'category' => $slug ) ) ) );
		$this->assertSame( array( 'Clip Counter' ), $this->titles( $this->run_query( array( 'category' => $slug, 'search' => 'clip' ) ) ) );
		$this->assertSame( array(), $this->titles( $this->run_query( array( 'category' => 'nope' ) ) ) );
	}

	public function test_twelve_per_page_with_total_for_pagination(): void {
		for ( $i = 1; $i <= 13; $i++ ) {
			$this->app( sprintf( 'App %02d', $i ), 'live', 'publish', '2026-01-01 10:00:00' ); // same date: only the ID tiebreak keeps pages stable
		}
		$page1 = $this->run_query( array(), 1 );
		$page2 = $this->run_query( array(), 2 );
		$this->assertCount( 12, $page1->posts );
		$this->assertCount( 1, $page2->posts );
		$this->assertSame( 13, (int) $page1->found_posts );
		$this->assertSame( 2, (int) $page1->max_num_pages );
		$this->assertSame( 13, count( array_unique( array_merge( wp_list_pluck( $page1->posts, 'ID' ), wp_list_pluck( $page2->posts, 'ID' ) ) ) ) );
	}

	public function test_request_is_sanitised_from_the_query_string(): void {
		$_GET = array( 's' => '  <b>clip</b>  ', 'category' => 'Creator Tools!', 'sort' => 'bogus' );
		$this->assertSame( array( 'search' => 'clip', 'category' => 'creator-tools', 'sort' => 'newest' ), ideatoapps_catalog_request() );
		$_GET = array( 's' => array( 'x' ), 'category' => array( 'y' ), 'sort' => 'title' );
		$this->assertSame( array( 'search' => '', 'category' => '', 'sort' => 'title' ), ideatoapps_catalog_request() );
		$_GET = array();
		$this->assertSame( array( 'search' => '', 'category' => '', 'sort' => 'newest' ), ideatoapps_catalog_request() );
	}

	public function test_url_helper_drops_defaults_and_escapes(): void {
		$base = get_post_type_archive_link( 'app' );
		$this->assertSame( $base, ideatoapps_catalog_url( array( 'search' => '', 'category' => '', 'sort' => 'newest' ) ) );
		$url = ideatoapps_catalog_url( array( 'search' => 'a b&c', 'category' => 'x', 'sort' => 'title' ) );
		$this->assertStringContainsString( 's=a%20b%26c', $url );
		$this->assertStringContainsString( 'category=x', $url );
		$this->assertStringContainsString( 'sort=title', $url );
	}

	public function test_categories_only_include_those_with_a_visible_app_and_the_card_part_adds_no_queries_per_app(): void {
		$this->app( 'Visible', 'live', 'publish', '2026-01-01 10:00:00', array( 'one' ) );
		$this->app( 'Hidden', 'draft', 'publish', '2026-01-01 10:00:00', array( 'two' ) );
		$names = array_map( static fn( $row ) => $row['term']->name, ideatoapps_home_categories() );
		$this->assertSame( array( 'one' ), $names );

		$render = function ( int $apps ): int {
			global $wpdb;
			foreach ( get_posts( array( 'post_type' => 'app', 'numberposts' => -1, 'post_status' => 'any' ) ) as $p ) {
				wp_delete_post( $p->ID, true );
			}
			for ( $i = 0; $i < $apps; $i++ ) {
				$this->app( "N $i", 'live', 'publish', '2026-01-01 10:00:00', array( 'cat' . $i ) );
			}
			wp_cache_flush();
			$q      = $this->run_query();
			$before = $wpdb->num_queries;
			ob_start();
			foreach ( $q->posts as $post ) {
				ideatoapps_part( 'app-card', array( 'app' => $post ) );
			}
			ob_end_clean();
			return $wpdb->num_queries - $before;
		};
		$this->assertSame( $render( 2 ), $render( 10 ), 'rendering cards must not query per app' );
	}
}
