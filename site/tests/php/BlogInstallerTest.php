<?php
final class BlogInstallerTest extends WPTestCase {
	private string $dir = '';

	protected function setUp(): void {
		parent::setUp();
		$this->dir = sys_get_temp_dir() . '/ita-articles-' . wp_generate_password( 8, false );
		mkdir( $this->dir );
		add_filter( 'ideatoapps_blog_articles_dir', array( $this, 'dir' ) );
		$this->article( '01-what-ai-is-and-isnt', 'ai-basics', false );
		$this->article( '02-ml-vs-deep-learning-vs-generative-ai', 'ai-basics', false );
		$this->article( '09-the-four-part-prompt-recipe', 'prompting', true );
		wp_set_current_user( self::make_user( 'administrator' ) );
	}

	protected function tearDown(): void {
		remove_filter( 'ideatoapps_blog_articles_dir', array( $this, 'dir' ) );
		foreach ( glob( $this->dir . '/*' ) ?: array() as $f ) {
			unlink( $f );
		}
		rmdir( $this->dir );
		parent::tearDown();
	}

	public function dir(): string {
		return $this->dir;
	}

	private function header( string $slug, string $cat, bool $gated, array $over = array() ): string {
		return '<!--ita ' . wp_json_encode( $over + array( 'slug' => $slug, 'title' => 'Title ' . $slug, 'category' => $cat, 'excerpt' => 'Short excerpt.', 'reviewed' => '2026-11-16', 'gated' => $gated, 'check' => array( 'claim "one" \\ x', 'claim two', 'claim three' ) ) ) . " -->\n<p>Body of {$slug} with a back\\slash.</p>\n";
	}

	private function article( string $slug, string $cat, bool $gated, array $over = array() ): string {
		$path = $this->dir . '/' . $slug . '.html';
		file_put_contents( $path, $this->header( $slug, $cat, $gated, $over ) );
		return $path;
	}

	private function starter( string $slug ): int {
		return ideatoapps_blog_find_starter( $slug );
	}

	/* Parser */

	public function test_parser_returns_the_fields(): void {
		$a = ideatoapps_blog_parse_article( $this->dir . '/09-the-four-part-prompt-recipe.html' );
		$this->assertIsArray( $a );
		$this->assertSame( 'prompting', $a['category'] );
		$this->assertTrue( $a['gated'] );
		$this->assertSame( 3, count( $a['check'] ) );
		$this->assertStringStartsWith( '<p>Body of 09', $a['body'] );
	}

	public function test_parser_rejects_bad_files_without_throwing_or_notices(): void {
		$cases = array(
			'bad json'       => '<!--ita {nope} -->body',
			'no header'      => 'just text',
			'empty body'     => rtrim( $this->header( '01-what-ai-is-and-isnt', 'ai-basics', false ) ) === '' ? '' : preg_replace( '/-->.*\z/s', '-->', $this->header( '01-what-ai-is-and-isnt', 'ai-basics', false ) ),
		);
		$over = array(
			array( 'slug' => '1-bad' ), array( 'slug' => '03-not-in-topics' ), array( 'category' => 'cooking' ), array( 'excerpt' => str_repeat( 'x', 161 ) ),
			array( 'excerpt' => '' ), array( 'check' => array( 'a', 'b' ) ), array( 'check' => array( 'a', 'b', ' ' ) ), array( 'check' => array_fill( 0, 7, 'x' ) ),
			array( 'check' => 'text' ), array( 'reviewed' => '2026-02-30' ), array( 'reviewed' => 'yesterday' ), array( 'title' => '' ), array( 'gated' => 'yes' ),
		);
		foreach ( $over as $i => $o ) {
			$cases[ 'over' . $i ] = $this->header( '01-what-ai-is-and-isnt', 'ai-basics', false, $o );
		}
		foreach ( $cases as $name => $text ) {
			file_put_contents( $this->dir . '/01-what-ai-is-and-isnt.html', $text );
			$this->assertInstanceOf( WP_Error::class, ideatoapps_blog_parse_article( $this->dir . '/01-what-ai-is-and-isnt.html' ), $name );
		}
		$this->assertInstanceOf( WP_Error::class, ideatoapps_blog_parse_article( $this->dir . '/missing.html' ) );
		$this->article( '02-ml-vs-deep-learning-vs-generative-ai', 'ai-basics', false );
		file_put_contents( $this->dir . '/01-what-ai-is-and-isnt.html', $this->header( '02-ml-vs-deep-learning-vs-generative-ai', 'ai-basics', false ) );
		$this->assertInstanceOf( WP_Error::class, ideatoapps_blog_parse_article( $this->dir . '/01-what-ai-is-and-isnt.html' ), 'slug must match the file name' );
	}

	/* Installer */

	public function test_install_creates_drafts_with_meta_and_category(): void {
		$r = ideatoapps_blog_install();
		$this->assertSame( array( 'created' => 3, 'skipped' => 0, 'errors' => 0 ), $r );
		$id = $this->starter( '09-the-four-part-prompt-recipe' );
		$p  = get_post( $id );
		$this->assertSame( 'draft', $p->post_status );
		$this->assertSame( 'post', $p->post_type );
		$this->assertSame( 'the-four-part-prompt-recipe', $p->post_name );
		$this->assertSame( get_current_user_id(), (int) $p->post_author );
		$this->assertSame( 'Short excerpt.', $p->post_excerpt );
		$this->assertSame( hash( 'sha256', $p->post_content ), get_post_meta( $id, 'ita_starter_hash', true ) );
		$this->assertStringContainsString( 'back\\slash', $p->post_content );
		$this->assertSame( '2026-11-16', get_post_meta( $id, 'ita_drafted_on', true ) );
		$this->assertSame( '1', (string) get_post_meta( $id, 'ita_gated', true ) );
		$this->assertSame( '0', (string) get_post_meta( $this->starter( '01-what-ai-is-and-isnt' ), 'ita_gated', true ) );
		$this->assertSame( array( 'claim "one" \\ x', 'claim two', 'claim three' ), json_decode( get_post_meta( $id, 'ita_check', true ), true ) );
		$this->assertSame( 'ai_draft', get_post_meta( $id, 'ita_review_status', true ) );
		$this->assertSame( '', (string) get_post_meta( $id, 'ita_last_reviewed', true ), 'the draft date is never a review date' );
		$cat = get_the_category( $id );
		$this->assertSame( 'prompting', $cat[0]->slug );
		$this->assertSame( 'Prompting', $cat[0]->name );
	}

	public function test_existing_category_is_used_and_never_renamed(): void {
		$t = wp_insert_term( 'My own name', 'category', array( 'slug' => 'prompting' ) );
		ideatoapps_blog_install();
		$this->assertSame( 'My own name', get_term( $t['term_id'], 'category' )->name );
		$this->assertSame( $t['term_id'], get_the_category( $this->starter( '09-the-four-part-prompt-recipe' ) )[0]->term_id );
	}

	public function test_second_run_creates_nothing_and_never_publishes(): void {
		ideatoapps_blog_install();
		$r = ideatoapps_blog_install();
		$this->assertSame( array( 'created' => 0, 'skipped' => 3, 'errors' => 0 ), $r );
		$this->assertSame( 3, count( get_posts( array( 'post_status' => 'any', 'meta_key' => 'ita_starter_slug', 'numberposts' => -1 ) ) ) ); // phpcs:ignore
		$this->assertSame( array(), get_posts( array( 'post_status' => 'publish', 'meta_key' => 'ita_starter_slug', 'numberposts' => -1 ) ) ); // phpcs:ignore
	}

	public function test_edited_post_is_never_touched(): void {
		ideatoapps_blog_install();
		$id = $this->starter( '01-what-ai-is-and-isnt' );
		wp_update_post( array( 'ID' => $id, 'post_content' => 'Owner edit', 'post_title' => 'Owner title' ) );
		file_put_contents( $this->dir . '/01-what-ai-is-and-isnt.html', $this->header( '01-what-ai-is-and-isnt', 'ai-basics', false, array( 'title' => 'New' ) ) . 'changed' );
		ideatoapps_blog_install();
		$p = get_post( $id );
		$this->assertSame( 'Owner edit', $p->post_content );
		$this->assertSame( 'Owner title', $p->post_title );
		$this->assertNotSame( hash( 'sha256', $p->post_content ), get_post_meta( $id, 'ita_starter_hash', true ) );
	}

	public function test_trashed_starter_post_is_not_recreated(): void {
		ideatoapps_blog_install();
		$id = $this->starter( '01-what-ai-is-and-isnt' );
		wp_trash_post( $id );
		$r = ideatoapps_blog_install();
		$this->assertSame( 0, $r['created'] );
		$this->assertSame( 'trash', get_post_status( $id ) );
		$this->assertSame( $id, $this->starter( '01-what-ai-is-and-isnt' ) );
	}

	public function test_malformed_file_counts_as_error_and_the_rest_installs(): void {
		file_put_contents( $this->dir . '/02-ml-vs-deep-learning-vs-generative-ai.html', '<!--ita {broken -->x' );
		$r = ideatoapps_blog_install();
		$this->assertSame( array( 'created' => 2, 'skipped' => 0, 'errors' => 1 ), $r );
		$this->assertSame( 0, $this->starter( '02-ml-vs-deep-learning-vs-generative-ai' ) );
	}

	public function test_status_counts_installed_files(): void {
		$this->assertSame( array( 'total' => 3, 'installed' => 0 ), ideatoapps_blog_install_status() );
		ideatoapps_blog_install();
		$this->assertSame( array( 'total' => 3, 'installed' => 3 ), ideatoapps_blog_install_status() );
	}

	/* Admin action */

	public function test_only_admins_with_a_valid_nonce_may_install(): void {
		$nonce = wp_create_nonce( 'ideatoapps_install_starter' );
		$this->assertTrue( ideatoapps_blog_can_install( $nonce ) );
		$this->assertFalse( ideatoapps_blog_can_install( 'bad' ) );
		$this->assertFalse( ideatoapps_blog_can_install( '' ) );
		$this->assertFalse( ideatoapps_blog_can_install( null ) );
		$this->assertFalse( ideatoapps_blog_can_install( wp_create_nonce( 'other_action' ) ) );
		foreach ( array( 'editor', 'author', 'subscriber', 'shop_manager' ) as $role ) {
			wp_set_current_user( self::make_user( $role ) );
			$this->assertFalse( ideatoapps_blog_can_install( wp_create_nonce( 'ideatoapps_install_starter' ) ), $role );
		}
		wp_set_current_user( 0 );
		$this->assertFalse( ideatoapps_blog_can_install( wp_create_nonce( 'ideatoapps_install_starter' ) ) );
	}

	public function test_settings_section_shows_counts_button_and_result(): void {
		ideatoapps_blog_install();
		$_GET = array( 'ita_created' => '3', 'ita_skipped' => '0', 'ita_errors' => '1' );
		ob_start();
		ideatoapps_render_starter_section();
		$html = (string) ob_get_clean();
		$_GET = array();
		$this->assertStringContainsString( '3 of 3 article files are installed', $html );
		$this->assertStringContainsString( '0 of 3 starter articles human reviewed', $html );
		$this->assertStringContainsString( 'value="ideatoapps_install_starter"', $html );
		$this->assertStringContainsString( 'Install starter articles', $html );
		$this->assertStringContainsString( '3 created as drafts, 0 already there (left alone), 1 with errors', $html );
		$this->assertStringContainsString( 'edit.php?ita_review=ai_draft', $html );
	}
}
