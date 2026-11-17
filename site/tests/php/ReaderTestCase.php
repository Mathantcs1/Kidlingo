<?php
require_once __DIR__ . '/SeoTestCase.php';

/**
 * Helpers for the subscriber-only (reader gate) tests: the newsletter switch on, real starter articles as published posts,
 * subscribers in each state, the reader cookie, captured mail and cookie writes, and the full single-post page as HTML.
 */
abstract class ReaderTestCase extends SeoTestCase {
	/** Sentences from late in article 08 (rendered, no quotes): none may reach a visitor who is not a subscriber. */
	protected const LATE = array(
		'Scroll through the week',
		'Spotting one yourself teaches you what to watch for',
		'Why use one chatbot app for the whole first week',
		'Plans are a good fit, because you can judge them with common sense',
		'Never paste passwords, bank details or ID numbers into any chat',
	);
	/** The opening sentence of article 08: the teaser shows it. */
	protected const EARLY = 'A good way to learn an AI chatbot is to use it for small, real tasks';

	/** @var array<int, array{0:int, 1:string}> Cookies the code under test set (subscriber id, value). */
	protected array $cookies = array();
	/** @var array<int, array<string, mixed>> */
	protected array $mails = array();
	protected bool $mail_ok = true;
	/** @var callable */
	private $mail_cb;
	/** @var callable */
	private $cookie_cb;

	protected function setUp(): void {
		parent::setUp();
		$_SERVER['REMOTE_ADDR'] = '198.51.100.' . wp_rand( 1, 250 );
		$_COOKIE                = array();
		update_option( 'ideatoapps_newsletter_enabled', true );
		$this->cookies   = array();
		$this->mails     = array();
		$this->mail_ok   = true;
		$this->cookie_cb = function ( $sid, $value ) {
			$this->cookies[] = array( (int) $sid, (string) $value );
		};
		$this->mail_cb   = function ( $short, $atts ) {
			$this->mails[] = $atts;
			return $this->mail_ok;
		};
		add_action( 'ideatoapps_reader_cookie_set', $this->cookie_cb, 10, 2 );
		add_filter( 'pre_wp_mail', $this->mail_cb, 10, 2 );
		$GLOBALS['ideatoapps_reader_link_queue'] = array();
		remove_action( 'shutdown', 'ideatoapps_reader_link_flush_queue' );
	}

	protected function tearDown(): void {
		remove_action( 'ideatoapps_reader_cookie_set', $this->cookie_cb, 10 );
		remove_filter( 'pre_wp_mail', $this->mail_cb, 10 );
		delete_option( 'ideatoapps_newsletter_enabled' );
		delete_option( 'ideatoapps_newsletter_mail_failures' );
		unset( $_SERVER['REMOTE_ADDR'], $GLOBALS['ideatoapps_reader_link_queue'] );
		$_COOKIE = array();
		$_POST   = array();
		parent::tearDown();
	}

	/** A real starter article file, parsed. */
	protected function article( string $slug ): array {
		$a = ideatoapps_blog_parse_article( IDEATOAPPS_CORE_DIR . "content/articles/{$slug}.php" );
		$this->assertIsArray( $a, $slug );
		return $a;
	}

	/** A published post with an article's body (not a starter post, so the review gate does not apply), gated or not. */
	protected function gated_post( string $slug = '08-your-first-week-with-ai', bool $gated = true, string $excerpt = '' ): int {
		$a  = $this->article( $slug );
		$id = (int) wp_insert_post( wp_slash( array( 'post_title' => $a['title'], 'post_name' => 'reader-' . substr( md5( $slug . $excerpt ), 0, 8 ), 'post_status' => 'publish', 'post_content' => $a['body'], 'post_excerpt' => $excerpt ) ) );
		update_post_meta( $id, 'ita_gated', $gated ? 1 : 0 );
		return $id;
	}

	protected function subscriber( string $status, string $email = 'reader@example.com' ): int {
		return (int) wp_insert_post( array( 'post_type' => 'ita_subscriber', 'post_status' => 'private', 'post_title' => $email, 'meta_input' => array( 'email' => $email, 'consent_at' => gmdate( 'c' ), 'status' => $status ) ) );
	}

	/** Pretend the browser sends a reader cookie for a subscriber. */
	protected function with_cookie( int $sid ): void {
		$_COOKIE['ita_reader'] = ideatoapps_reader_cookie_value( $sid );
	}

	/** The single-post page for a logged-out visitor: head, the article as single.php prints it, footer scripts. */
	protected function page_html( int $id ): string {
		$this->go_to( (string) get_permalink( $id ) );
		$this->assertTrue( is_singular( 'post' ), 'the request resolves to the post' );
		// What single.php prints between the theme header and footer, plus everything hooked into wp_head and wp_footer. (Not the
		// template file itself: get_header() uses require_once, so a later test that renders a page would get no header.)
		ob_start();
		wp_head();
		while ( have_posts() ) {
			the_post();
			ideatoapps_part( 'post-article' );
		}
		wp_footer();
		return (string) ob_get_clean();
	}

	protected function assertNoLateText( string $html, string $where ): void {
		$text = html_entity_decode( $html, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		foreach ( self::LATE as $sentence ) {
			$this->assertStringNotContainsString( $sentence, $text, "{$where} leaks the gated body" );
		}
	}

	protected function assertHasLateText( string $html, string $where ): void {
		$text = html_entity_decode( $html, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		foreach ( self::LATE as $sentence ) {
			$this->assertStringContainsString( $sentence, $text, "{$where} shows the whole article" );
		}
	}
}
