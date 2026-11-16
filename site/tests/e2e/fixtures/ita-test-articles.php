<?php
/**
 * Test-only mu-plugin (never packaged): points the starter-article installer at tests/e2e/fixtures/articles, so specs can
 * create starter posts through the real "Install starter articles" button.
 */
add_filter( 'ideatoapps_blog_articles_dir', static fn() => WP_CONTENT_DIR . '/ita-test-articles' );
