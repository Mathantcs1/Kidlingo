<?php
/**
 * Starter content files are PHP files whose first line is the ABSPATH guard, so a direct URL request runs PHP and exits (no
 * article text, no topic list). The parser strips exactly that line and refuses any file without it.
 */
final class BlogArticleGuardTest extends WPTestCase {
	private string $dir = '';

	protected function setUp(): void {
		parent::setUp();
		$this->dir = sys_get_temp_dir() . '/ita-guard-' . wp_generate_password( 8, false );
		mkdir( $this->dir );
		add_filter( 'ideatoapps_blog_articles_dir', array( $this, 'dir' ) );
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

	/** The real 01 article without its guard line. */
	private static function unguarded(): string {
		$raw = (string) file_get_contents( IDEATOAPPS_CORE_DIR . 'content/articles/01-what-ai-is-and-isnt.php' );
		return substr( $raw, strlen( IDEATOAPPS_CONTENT_GUARD ) + 1 );
	}

	public function test_guard_line_is_exact(): void {
		$this->assertSame( "<?php defined( 'ABSPATH' ) || exit; ?>", IDEATOAPPS_CONTENT_GUARD );
	}

	public function test_every_shipped_article_and_the_topic_list_start_with_the_guard(): void {
		$files = glob( IDEATOAPPS_CORE_DIR . 'content/articles/*' ) ?: array();
		$this->assertNotEmpty( $files );
		foreach ( $files as $path ) {
			if ( 'index.php' === basename( $path ) ) {
				continue;
			}
			$this->assertStringEndsWith( '.php', $path );
			$this->assertStringStartsWith( IDEATOAPPS_CONTENT_GUARD . "\n", (string) file_get_contents( $path ), $path );
		}
		$this->assertFileDoesNotExist( IDEATOAPPS_CORE_DIR . 'content/topics.json' );
		$this->assertStringStartsWith( IDEATOAPPS_CONTENT_GUARD . "\n", (string) file_get_contents( IDEATOAPPS_CORE_DIR . 'content/topics.php' ) );
		$this->assertCount( 50, ideatoapps_blog_topics_data() );
	}

	public function test_parser_strips_the_guard_and_body_is_unchanged(): void {
		$path = $this->dir . '/01-what-ai-is-and-isnt.php';
		file_put_contents( $path, IDEATOAPPS_CONTENT_GUARD . "\n" . self::unguarded() );
		$a = ideatoapps_blog_parse_article( $path );
		$this->assertIsArray( $a );
		$this->assertStringNotContainsString( '<?php', $a['body'] );
		$this->assertSame( array( $path ), ideatoapps_blog_article_files() );
	}

	public function test_parser_refuses_a_file_without_the_guard(): void {
		$path = $this->dir . '/01-what-ai-is-and-isnt.php';
		foreach ( array( 'no guard' => self::unguarded(), 'guard later' => "\n" . IDEATOAPPS_CONTENT_GUARD . "\n" . self::unguarded(), 'other php' => "<?php ?>\n" . self::unguarded() ) as $name => $text ) {
			file_put_contents( $path, $text );
			$this->assertInstanceOf( WP_Error::class, ideatoapps_blog_parse_article( $path ), $name );
		}
	}

	public function test_html_files_are_not_articles(): void {
		file_put_contents( $this->dir . '/01-what-ai-is-and-isnt.html', IDEATOAPPS_CONTENT_GUARD . "\n" . self::unguarded() );
		$this->assertSame( array(), ideatoapps_blog_article_files() );
	}

	public function test_defence_files_ship_in_content(): void {
		$htaccess = (string) file_get_contents( IDEATOAPPS_CORE_DIR . 'content/.htaccess' );
		$this->assertStringContainsString( 'Options -Indexes', $htaccess );
		$this->assertStringContainsString( 'Require all denied', $htaccess );
		$this->assertStringContainsString( 'Deny from all', $htaccess );
		foreach ( array( '', 'articles/', 'figures/', 'heroes/' ) as $sub ) {
			$this->assertSame( "<?php // Silence is golden.\n", (string) file_get_contents( IDEATOAPPS_CORE_DIR . 'content/' . $sub . 'index.php' ), $sub );
		}
	}
}
