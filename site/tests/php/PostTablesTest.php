<?php
require_once __DIR__ . '/WPTestCase.php';

/** Tables in blog posts are keyboard-focusable (they scroll inside themselves on narrow screens). */
final class PostTablesTest extends WPTestCase {
	public function test_every_table_gets_tabindex_zero_and_an_existing_tabindex_is_kept(): void {
		$html = '<p>x</p><table><caption>A</caption><tr><th scope="col">H</th></tr></table><TABLE class="t" tabindex="-1"><tr><td>1</td></tr></TABLE><table id="b"><tr><td>2</td></tr></table>';
		$out  = ideatoapps_post_tables_focusable( $html );
		$this->assertSame( 2, substr_count( $out, 'tabindex="0"' ) );
		$this->assertStringContainsString( 'tabindex="-1"', $out );
		$this->assertStringContainsString( '<caption>A</caption>', $out );
		$this->assertSame( '<p>No table here.</p>', ideatoapps_post_tables_focusable( '<p>No table here.</p>' ) );
	}

	public function test_the_content_of_a_post_gets_focusable_tables_but_a_page_does_not(): void {
		$body = '<table><caption>C</caption><tr><td>1</td></tr></table>';
		foreach ( array( 'post' => 1, 'page' => 0 ) as $type => $want ) {
			$id = (int) wp_insert_post( array( 'post_type' => $type, 'post_status' => 'publish', 'post_title' => 'T', 'post_content' => $body ) );
			$GLOBALS['post'] = get_post( $id ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- test sets the current post.
			setup_postdata( $GLOBALS['post'] );
			$this->assertSame( $want, substr_count( (string) apply_filters( 'the_content', get_the_content() ), 'tabindex="0"' ), $type );
			wp_reset_postdata();
		}
	}
}
