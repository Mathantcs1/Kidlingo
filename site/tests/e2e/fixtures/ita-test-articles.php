<?php
/**
 * Test-only mu-plugin (never packaged): points the starter-article installer at tests/e2e/fixtures/articles, so specs can
 * create starter posts through the real "Install starter articles" button, and lets specs set a post's level and audiences.
 */
add_filter( 'ideatoapps_blog_articles_dir', static fn() => WP_CONTENT_DIR . '/ita-test-articles' );

// Test-only: set a post's reader level and audiences meta (protected meta that the REST API cannot write), stored exactly as given so
// specs can also try odd stored values. Administrators only.
add_action(
	'rest_api_init',
	static function (): void {
		register_rest_route(
			'ita-test/v1',
			'/level/(?P<id>\d+)',
			array(
				'methods'             => 'POST',
				'permission_callback' => static fn(): bool => current_user_can( 'manage_options' ),
				'callback'            => static function ( WP_REST_Request $r ): array {
					$id = (int) $r['id'];
					update_post_meta( $id, 'ita_level', wp_slash( (string) $r->get_param( 'level' ) ) );
					update_post_meta( $id, 'ita_audiences', wp_slash( (string) $r->get_param( 'audiences' ) ) );
					return array( 'id' => $id );
				},
			)
		);
	}
);
