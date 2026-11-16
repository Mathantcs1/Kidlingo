<?php
final class BlogReviewTest extends WPTestCase {
	private string $dir = '';
	private int $admin = 0;

	protected function setUp(): void {
		parent::setUp();
		$this->dir = sys_get_temp_dir() . '/ita-review-' . wp_generate_password( 8, false );
		mkdir( $this->dir );
		add_filter( 'ideatoapps_blog_articles_dir', array( $this, 'dir' ) );
		foreach ( array( '01-what-ai-is-and-isnt' => 'ai-basics', '02-ml-vs-deep-learning-vs-generative-ai' => 'ai-basics' ) as $slug => $cat ) {
			file_put_contents( $this->dir . "/$slug.html", '<!--ita ' . wp_json_encode( array( 'slug' => $slug, 'title' => "T $slug", 'category' => $cat, 'excerpt' => 'Ex.', 'reviewed' => '2026-01-02', 'check' => array( 'Claim <b>A</b>', 'Claim B', 'Claim C' ) ) ) . " -->\n<p>Body $slug</p>" );
		}
		$this->admin = self::make_user( 'administrator' );
		wp_set_current_user( $this->admin );
		ideatoapps_blog_install();
	}

	protected function tearDown(): void {
		remove_filter( 'ideatoapps_blog_articles_dir', array( $this, 'dir' ) );
		foreach ( glob( $this->dir . '/*' ) ?: array() as $f ) {
			unlink( $f );
		}
		rmdir( $this->dir );
		$_POST = array();
		delete_transient( 'ita_review_refused_' . $this->admin );
		parent::tearDown();
	}

	public function dir(): string {
		return $this->dir;
	}

	private function starter(): int {
		return ideatoapps_blog_find_starter( '01-what-ai-is-and-isnt' );
	}

	private function req( int $id, array $over = array() ): array {
		return $over + array( 'ita_review_nonce' => wp_create_nonce( 'ita_review_' . $id ), 'ita_review_name' => 'Dana Reviewer', 'ita_review_check' => array_keys( ideatoapps_review_checklist() ) );
	}

	private function sign( int $id, array $over = array() ): string {
		return ideatoapps_review_sign_off( $id, (string) get_post_field( 'post_content', $id ), $this->req( $id, $over ) );
	}

	private function st( int $id ): string {
		clean_post_cache( $id );
		return get_post_status( $id );
	}

	/* The publish guard, every path */

	public function test_wp_update_post_cannot_publish_or_schedule_an_unreviewed_post(): void {
		$id = $this->starter();
		wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
		$this->assertSame( 'draft', $this->st( $id ) );
		wp_update_post( array( 'ID' => $id, 'post_status' => 'future', 'post_date' => gmdate( 'Y-m-d H:i:s', time() + 86400 ), 'post_date_gmt' => gmdate( 'Y-m-d H:i:s', time() + 86400 ) ) );
		$this->assertSame( 'draft', $this->st( $id ) );
		$this->assertSame( 1, (int) get_transient( 'ita_review_refused_' . $this->admin ), 'the admin notice is queued' );
	}

	public function test_wp_insert_post_with_the_starter_meta_cannot_be_published(): void {
		$id = (int) wp_insert_post( array( 'post_title' => 'X', 'post_status' => 'publish', 'post_content' => 'x', 'meta_input' => array( 'ita_review_status' => 'ai_draft' ) ) );
		$this->assertSame( 'draft', $this->st( $id ) );
		$id = (int) wp_insert_post( array( 'post_title' => 'Y', 'post_status' => 'publish', 'post_content' => 'y', 'meta_input' => array( 'ita_starter_slug' => '09-x' ) ) );
		$this->assertSame( 'draft', $this->st( $id ) );
	}

	public function test_rest_cannot_publish(): void {
		$id  = $this->starter();
		$req = new WP_REST_Request( 'POST', '/wp/v2/posts/' . $id );
		$req->set_body_params( array( 'status' => 'publish' ) );
		$res = rest_do_request( $req );
		$this->assertSame( 'draft', $this->st( $id ) );
		$this->assertSame( 'draft', $res->get_data()['status'] ?? 'draft' );
		$new = new WP_REST_Request( 'POST', '/wp/v2/posts' );
		$new->set_body_params( array( 'title' => 'Via REST', 'status' => 'publish', 'content' => 'c', 'meta' => array( 'ita_starter_slug' => '09-the-four-part-prompt-recipe' ) ) );
		$made = rest_do_request( $new )->get_data();
		$this->assertSame( 'draft', $this->st( (int) $made['id'] ), 'meta sent with the same request is checked after the insert' );
	}

	public function test_review_meta_cannot_be_written_through_rest_or_custom_fields(): void {
		foreach ( IDEATOAPPS_REVIEW_KEYS as $key ) {
			$this->assertTrue( is_protected_meta( $key, 'post' ), $key );
		}
		$id  = $this->starter();
		$req = new WP_REST_Request( 'POST', '/wp/v2/posts/' . $id );
		$req->set_body_params( array( 'meta' => array( 'ita_review_status' => 'human_reviewed' ) ) );
		rest_do_request( $req );
		$this->assertSame( 'ai_draft', get_post_meta( $id, 'ita_review_status', true ) );
	}

	public function test_bulk_edit_cannot_publish(): void {
		require_once ABSPATH . 'wp-admin/includes/post.php';
		$id = $this->starter();
		$b  = ideatoapps_blog_find_starter( '02-ml-vs-deep-learning-vs-generative-ai' );
		bulk_edit_posts( array( 'post' => array( $id, $b ), '_status' => 'publish', 'post_type' => 'post' ) );
		$this->assertSame( 'draft', $this->st( $id ) );
		$this->assertSame( 'draft', $this->st( $b ) );
	}

	public function test_xmlrpc_cannot_publish(): void {
		require_once ABSPATH . WPINC . '/class-IXR.php';
		require_once ABSPATH . WPINC . '/class-wp-xmlrpc-server.php';
		add_filter( 'xmlrpc_enabled', '__return_true' );
		$user = get_user_by( 'id', $this->admin );
		wp_set_password( 'pw-xmlrpc', $user->ID );
		$server = new wp_xmlrpc_server();
		$id     = $this->starter();
		$server->wp_editPost( array( 1, $user->user_login, 'pw-xmlrpc', $id, array( 'post_status' => 'publish' ) ) );
		$this->assertSame( 'draft', $this->st( $id ) );
		remove_filter( 'xmlrpc_enabled', '__return_true' );
	}

	public function test_wp_publish_post_is_pulled_back(): void {
		$id = $this->starter();
		wp_publish_post( $id );
		$this->assertSame( 'draft', $this->st( $id ) );
	}

	public function test_posts_without_a_review_status_are_unaffected(): void {
		$id = (int) wp_insert_post( array( 'post_title' => 'Mine', 'post_status' => 'publish', 'post_content' => 'x' ) );
		wp_update_post( array( 'ID' => $id, 'post_content' => 'edited' ) );
		$this->assertSame( 'publish', $this->st( $id ) );
		$this->assertSame( '', ideatoapps_review_status( $id ) );
		$this->assertSame( 'ignored', ideatoapps_review_sign_off( $id, 'edited', $this->req( $id ) ) );
		$this->assertSame( '', get_post_meta( $id, 'ita_reviewer', true ) );
	}

	/* Sign-off */

	public function test_sign_off_needs_name_all_seven_ticks_capability_and_nonce(): void {
		$id = $this->starter();
		$this->assertSame( 'no_name', $this->sign( $id, array( 'ita_review_name' => '   ' ) ) );
		$this->assertSame( 'no_name', $this->sign( $id, array( 'ita_review_name' => '<b></b>' ) ) );
		$this->assertSame( 'name_too_long', $this->sign( $id, array( 'ita_review_name' => str_repeat( 'a', 81 ) ) ) );
		$six = array_slice( array_keys( ideatoapps_review_checklist() ), 1 );
		$this->assertSame( 'unchecked', $this->sign( $id, array( 'ita_review_check' => $six ) ) );
		$this->assertSame( 'unchecked', $this->sign( $id, array( 'ita_review_check' => array() ) ) );
		$this->assertSame( 'bad_nonce', $this->sign( $id, array( 'ita_review_nonce' => 'nope' ) ) );
		$this->assertSame( 'bad_nonce', $this->sign( $id, array( 'ita_review_nonce' => wp_create_nonce( 'ita_review_' . ( $id + 1 ) ) ) ) );
		$this->assertSame( 'ai_draft', ideatoapps_review_status( $id ), 'nothing was signed' );
		wp_set_current_user( self::make_user( 'contributor' ) );
		$this->assertSame( 'forbidden', $this->sign( $id ) );
		wp_set_current_user( 0 );
		$this->assertSame( 'forbidden', $this->sign( $id ) );
		$this->assertSame( 'ai_draft', ideatoapps_review_status( $id ) );
		wp_set_current_user( $this->admin );
		$this->assertSame( 'signed', $this->sign( $id ) );
		$this->assertSame( 'human_reviewed', ideatoapps_review_status( $id ) );
		$this->assertSame( 'Dana Reviewer', get_post_meta( $id, 'ita_reviewer', true ) );
		$this->assertSame( wp_date( 'Y-m-d' ), get_post_meta( $id, 'ita_reviewed_on', true ) );
		$this->assertSame( wp_date( 'Y-m-d' ), get_post_meta( $id, 'ita_last_reviewed', true ) );
		$this->assertNotSame( get_post_meta( $id, 'ita_drafted_on', true ), get_post_meta( $id, 'ita_last_reviewed', true ), 'last reviewed is the human review date, not the draft date' );
	}

	public function test_signed_post_can_be_published_and_then_edits_reset_it(): void {
		$id = $this->starter();
		$this->sign( $id );
		wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
		$this->assertSame( 'publish', $this->st( $id ) );
		wp_update_post( array( 'ID' => $id, 'post_title' => 'New title only' ) );
		$this->assertSame( 'publish', $this->st( $id ), 'a title change is not a content change' );
		wp_update_post( array( 'ID' => $id, 'post_content' => '<p>Changed after sign-off</p>' ) );
		$this->assertSame( 'draft', $this->st( $id ), 'a published post edited after sign-off goes back to draft' );
		$this->assertSame( 'needs_review', get_post_meta( $id, 'ita_review_status', true ) );
		wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
		$this->assertSame( 'draft', $this->st( $id ) );
		$this->assertSame( 'signed', $this->sign( $id, array( 'ita_review_name' => 'Second Person' ) ), 're-sign after the edit' );
		wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
		$this->assertSame( 'publish', $this->st( $id ) );
		$this->assertSame( 'Second Person', get_post_meta( $id, 'ita_reviewer', true ) );
	}

	public function test_sign_off_and_publish_in_one_save_through_the_form_fields(): void {
		$id    = $this->starter();
		$_POST = $this->req( $id ) + array( 'ita_review_sign' => '1', 'post_ID' => (string) $id );
		wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
		$this->assertSame( 'publish', $this->st( $id ) );
		$this->assertSame( 'human_reviewed', ideatoapps_review_status( $id ) );
	}

	public function test_form_save_without_all_ticks_does_not_publish(): void {
		$id    = $this->starter();
		$_POST = $this->req( $id, array( 'ita_review_check' => array( 'facts' ) ) ) + array( 'ita_review_sign' => '1', 'post_ID' => (string) $id );
		wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
		$this->assertSame( 'draft', $this->st( $id ) );
		$this->assertSame( 'ai_draft', ideatoapps_review_status( $id ) );
	}

	public function test_human_reviewed_meta_without_a_matching_hash_does_not_clear_a_post(): void {
		$id = $this->starter();
		update_post_meta( $id, 'ita_review_status', 'human_reviewed' );
		update_post_meta( $id, 'ita_reviewer', 'X' );
		update_post_meta( $id, 'ita_reviewed_on', '2026-11-16' );
		wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
		$this->assertSame( 'draft', $this->st( $id ) );
	}

	/* Byline, box, list */

	public function test_byline_text_is_exact_escaped_and_only_for_reviewed_posts(): void {
		$id = $this->starter();
		$this->assertSame( '', apply_filters( 'ideatoapps_post_byline_html', '', $id ) );
		$this->sign( $id, array( 'ita_review_name' => 'Ann <script>x</script> O\'Neil' ) );
		update_option( 'date_format', 'F j, Y' );
		update_post_meta( $id, 'ita_reviewed_on', '2026-03-05' );
		$html = (string) apply_filters( 'ideatoapps_post_byline_html', '', $id );
		$this->assertSame( 'Drafted with AI assistance. Edited and reviewed by Ann O&#039;Neil on March 5, 2026.', $html );
		$this->assertStringNotContainsString( '<script', $html );
		$this->assertStringNotContainsString( '2026-11-16', $html, 'the draft date is never shown as reviewed' );
		$plain = (int) wp_insert_post( array( 'post_title' => 'Mine', 'post_status' => 'publish', 'post_content' => 'x' ) );
		$this->assertSame( '', apply_filters( 'ideatoapps_post_byline_html', '', $plain ) );
		$this->assertSame( 'Other', apply_filters( 'ideatoapps_post_byline_html', 'Other', $id ), 'an existing byline is kept' );
	}

	public function test_editing_after_sign_off_removes_the_byline(): void {
		$id = $this->starter();
		$this->sign( $id );
		wp_update_post( array( 'ID' => $id, 'post_content' => 'changed' ) );
		$this->assertSame( '', apply_filters( 'ideatoapps_post_byline_html', '', $id ) );
	}

	public function test_box_lists_claims_checklist_and_never_prefills_the_name(): void {
		$id = $this->starter();
		update_post_meta( $id, 'ita_check', wp_slash( wp_json_encode( array( 'Claim <b>A</b>', 'B' ) ) ) );
		ob_start();
		ideatoapps_review_render_box( get_post( $id ) );
		$html = (string) ob_get_clean();
		$this->assertStringContainsString( 'Check these claims first', $html );
		$this->assertStringContainsString( 'Claim &lt;b&gt;A&lt;/b&gt;', $html );
		$this->assertSame( 7, substr_count( $html, 'name="ita_review_check[]"' ) );
		$this->assertStringContainsString( 'name="ita_review_name"', $html );
		$this->assertMatchesRegularExpression( '/name="ita_review_name"[^>]*value=""/', $html );
		$this->assertStringNotContainsString( (string) wp_get_current_user()->display_name, $html );
		$this->assertStringContainsString( 'Mark as human reviewed', $html );
		$this->sign( $id, array( 'ita_review_name' => '"><img src=x>' ) );
		ob_start();
		ideatoapps_review_render_box( get_post( $id ) );
		$this->assertStringNotContainsString( '<img src=x>', (string) ob_get_clean() );
		wp_update_post( array( 'ID' => $id, 'post_content' => 'edited' ) );
		ob_start();
		ideatoapps_review_render_box( get_post( $id ) );
		$this->assertStringContainsString( 'Re-sign', (string) ob_get_clean() );
	}

	public function test_box_says_nothing_is_required_for_other_posts(): void {
		$plain = (int) wp_insert_post( array( 'post_title' => 'Mine', 'post_status' => 'publish', 'post_content' => 'x' ) );
		ob_start();
		ideatoapps_review_render_box( get_post( $plain ) );
		$html = (string) ob_get_clean();
		$this->assertStringContainsString( 'no review is required', $html );
		$this->assertStringNotContainsString( 'ita_review_name', $html );
	}

	public function test_list_column_and_progress(): void {
		$id = $this->starter();
		ob_start();
		do_action( 'manage_post_posts_custom_column', 'ita_review', $id );
		$this->assertStringContainsString( 'AI draft', (string) ob_get_clean() );
		$this->assertSame( array( 'reviewed' => 0, 'total' => 2 ), ideatoapps_review_progress() );
		$this->sign( $id );
		ob_start();
		do_action( 'manage_post_posts_custom_column', 'ita_review', $id );
		$this->assertStringContainsString( 'Human reviewed', (string) ob_get_clean() );
		$this->assertSame( array( 'reviewed' => 1, 'total' => 2 ), ideatoapps_review_progress() );
		$this->assertArrayHasKey( 'ita_review', apply_filters( 'manage_post_posts_columns', array() ) );
	}
}
