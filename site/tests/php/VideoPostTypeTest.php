<?php
final class VideoPostTypeTest extends WPTestCase {
	private function make_video( array $meta = array() ): int {
		return wp_insert_post( array( 'post_type' => 'video', 'post_title' => 'Demo video', 'post_status' => 'publish', 'meta_input' => $meta ) );
	}

	private function make_app(): int {
		return wp_insert_post( array( 'post_type' => 'app', 'post_title' => 'App', 'post_status' => 'publish' ) );
	}

	public function test_video_post_type_registered(): void {
		$pt = get_post_type_object( 'video' );
		$this->assertNotNull( $pt );
		$this->assertTrue( $pt->public );
		$this->assertSame( 'learn', $pt->has_archive );
		$this->assertSame( 'learn', $pt->rewrite['slug'] );
		$this->assertTrue( $pt->show_in_rest );
		foreach ( array( 'title', 'editor', 'thumbnail', 'excerpt' ) as $feature ) {
			$this->assertTrue( post_type_supports( 'video', $feature ), $feature );
		}
	}

	public function test_meta_registered_for_rest(): void {
		foreach ( array( 'youtube_id', 'related_app_id' ) as $key ) {
			$this->assertTrue( registered_meta_key_exists( 'post', $key, 'video' ), $key );
		}
	}

	public function test_youtube_id_must_be_eleven_safe_characters(): void {
		$id = $this->make_video();
		update_post_meta( $id, 'youtube_id', 'dQw4w9WgXcQ' );
		$this->assertSame( 'dQw4w9WgXcQ', get_post_meta( $id, 'youtube_id', true ) );
		update_post_meta( $id, 'youtube_id', 'a_b-C1234ef' );
		$this->assertSame( 'a_b-C1234ef', get_post_meta( $id, 'youtube_id', true ) );
		foreach ( array( 'short', 'dQw4w9WgXcQQ', 'dQw4w9Wg"cQ', '<script>aaaa', 'dQw4w9Wg cQ', "dQw4w9WgXc\n" ) as $bad ) {
			update_post_meta( $id, 'youtube_id', $bad );
			$this->assertSame( '', get_post_meta( $id, 'youtube_id', true ), $bad );
		}
	}

	public function test_related_app_must_be_an_app_post_or_zero(): void {
		$app  = $this->make_app();
		$post = wp_insert_post( array( 'post_type' => 'post', 'post_title' => 'Blog', 'post_status' => 'publish' ) );
		$id   = $this->make_video();
		update_post_meta( $id, 'related_app_id', $app );
		$this->assertSame( $app, (int) get_post_meta( $id, 'related_app_id', true ) );
		update_post_meta( $id, 'related_app_id', $post );
		$this->assertSame( 0, (int) get_post_meta( $id, 'related_app_id', true ), 'a blog post is not an app' );
		update_post_meta( $id, 'related_app_id', 999999 );
		$this->assertSame( 0, (int) get_post_meta( $id, 'related_app_id', true ), 'unknown id' );
		update_post_meta( $id, 'related_app_id', -$app );
		$this->assertSame( $app, (int) get_post_meta( $id, 'related_app_id', true ), 'negative values are absint-ed to a real app' );
		update_post_meta( $id, 'related_app_id', 0 );
		$this->assertSame( 0, (int) get_post_meta( $id, 'related_app_id', true ) );
	}

	public function test_meta_auth_requires_edit_post(): void {
		$id = $this->make_video();
		wp_set_current_user( wp_insert_user( array( 'user_login' => 'sub_v', 'user_pass' => 'x', 'role' => 'subscriber' ) ) );
		foreach ( array( 'youtube_id', 'related_app_id' ) as $key ) {
			$this->assertFalse( current_user_can( 'edit_post_meta', $id, $key ), $key );
		}
		wp_set_current_user( wp_insert_user( array( 'user_login' => 'ed_v', 'user_pass' => 'x', 'role' => 'administrator' ) ) );
		foreach ( array( 'youtube_id', 'related_app_id' ) as $key ) {
			$this->assertTrue( current_user_can( 'edit_post_meta', $id, $key ), $key );
		}
	}

	public function test_activation_makes_learn_urls_resolve(): void {
		global $wp_rewrite;
		$wp_rewrite->set_permalink_structure( '/%postname%/' );
		delete_option( 'rewrite_rules' );
		ideatoapps_core_activate();
		$this->assertArrayHasKey( 'learn/?$', get_option( 'rewrite_rules' ) );
		$wp_rewrite->set_permalink_structure( '' );
	}
}
