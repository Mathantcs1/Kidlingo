<?php
require_once __DIR__ . '/WPTestCase.php';

/**
 * Article header `level` and `audiences`: whitelisted, equal to the topic's values in topics.json, stored by the installer as the
 * protected meta ita_level and ita_audiences.
 */
final class BlogArticleLevelTest extends WPTestCase {
	private string $dir = '';

	protected function setUp(): void {
		parent::setUp();
		$this->dir = sys_get_temp_dir() . '/ita-levels-' . wp_generate_password( 8, false );
		mkdir( $this->dir );
		add_filter( 'ideatoapps_blog_articles_dir', array( $this, 'dir' ) );
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

	private static function topic( string $slug ): array {
		foreach ( json_decode( (string) file_get_contents( IDEATOAPPS_CORE_DIR . 'content/topics.json' ), true ) as $t ) {
			if ( $t['slug'] === $slug ) {
				return $t;
			}
		}
		return array();
	}

	/** Write an article file for a topic; $over replaces header fields (null removes one). */
	private function write( string $slug, array $over = array() ): string {
		$t = self::topic( $slug );
		$h = array_merge(
			array( 'slug' => $slug, 'title' => $t['title'], 'category' => $t['category'], 'excerpt' => 'Short.', 'reviewed' => '2026-11-16', 'gated' => false, 'level' => $t['level'], 'audiences' => $t['audiences'], 'check' => array( 'a', 'b', 'c' ) ),
			$over
		);
		$h    = array_filter( $h, static fn( $v ) => null !== $v );
		$path = $this->dir . '/' . $slug . '.html';
		file_put_contents( $path, '<!--ita ' . wp_json_encode( $h ) . " -->\n<p>Body.</p>\n" );
		return $path;
	}

	public function test_the_plugin_whitelists(): void {
		$this->assertSame( array( 'beginner', 'intermediate', 'advanced' ), IDEATOAPPS_BLOG_LEVELS );
		$this->assertSame( array( 'beginners', 'students', 'teachers-and-tutors', 'parents-and-families', 'workers-and-business-owners', 'creators', 'builders' ), IDEATOAPPS_BLOG_AUDIENCES );
	}

	public function test_parser_returns_level_and_audiences_from_the_header(): void {
		$a = ideatoapps_blog_parse_article( $this->write( '27-what-is-an-ai-agent' ) );
		$this->assertIsArray( $a );
		$this->assertSame( 'intermediate', $a['level'] );
		$this->assertSame( self::topic( '27-what-is-an-ai-agent' )['audiences'], $a['audiences'] );
	}

	/** @return array<string, array{array<string, mixed>}> */
	public static function bad_headers(): array {
		return array(
			'no level'              => array( array( 'level' => null ) ),
			'unknown level'         => array( array( 'level' => 'expert' ) ),
			'level case'            => array( array( 'level' => 'Beginner' ) ),
			'level padded'          => array( array( 'level' => ' beginner' ) ),
			'level array'           => array( array( 'level' => array( 'beginner' ) ) ),
			'level not the topic'   => array( array( 'level' => 'advanced' ) ),
			'no audiences'          => array( array( 'audiences' => null ) ),
			'empty audiences'       => array( array( 'audiences' => array() ) ),
			'audiences a string'    => array( array( 'audiences' => 'beginners' ) ),
			'unknown audience'      => array( array( 'audiences' => array( 'beginners', 'robots' ) ) ),
			'audience case'         => array( array( 'audiences' => array( 'Beginners', 'students', 'parents-and-families' ) ) ),
			'audiences not topic'   => array( array( 'audiences' => array( 'builders' ) ) ),
			'audiences subset'      => array( array( 'audiences' => array( 'beginners' ) ) ),
			'audiences duplicated'  => array( array( 'audiences' => array( 'beginners', 'beginners', 'students', 'parents-and-families' ) ) ),
			'audiences with markup' => array( array( 'audiences' => array( '<b>beginners</b>', 'students', 'parents-and-families' ) ) ),
		);
	}

	#[\PHPUnit\Framework\Attributes\DataProvider( 'bad_headers' )]
	public function test_parser_rejects_unknown_or_mismatched_values( array $over ): void {
		$r = ideatoapps_blog_parse_article( $this->write( '01-what-ai-is-and-isnt', $over ) );
		$this->assertInstanceOf( WP_Error::class, $r );
	}

	/** Even when topics.json itself holds an unknown value, the header is refused: the whitelist is checked, not only equality. */
	public function test_unknown_values_are_refused_even_when_topics_json_has_them(): void {
		foreach ( array( array( 'level' => 'expert' ), array( 'audiences' => array( 'robots' ) ), array( 'audiences' => array( 'beginners', 'students', 'creators', 'builders' ) ) ) as $bad ) {
			$filter = static function ( array $topics ) use ( $bad ): array {
				foreach ( $topics as $i => $t ) {
					if ( '01-what-ai-is-and-isnt' === $t['slug'] ) {
						$topics[ $i ] = $bad + $t;
					}
				}
				return $topics;
			};
			add_filter( 'ideatoapps_blog_topic_list', $filter );
			$r = ideatoapps_blog_parse_article( $this->write( '01-what-ai-is-and-isnt', $bad ) );
			remove_filter( 'ideatoapps_blog_topic_list', $filter );
			$this->assertInstanceOf( WP_Error::class, $r, wp_json_encode( $bad ) );
		}
		$this->assertIsArray( ideatoapps_blog_parse_article( $this->write( '01-what-ai-is-and-isnt' ) ), 'filter removed: valid again' );
	}

	public function test_installer_stores_level_and_audiences_as_protected_meta(): void {
		$this->write( '09-the-four-part-prompt-recipe' );
		$this->assertSame( 1, ideatoapps_blog_install()['created'] );
		$id = ideatoapps_blog_find_starter( '09-the-four-part-prompt-recipe' );
		$this->assertSame( 'beginner', get_post_meta( $id, 'ita_level', true ) );
		$this->assertSame( implode( ',', self::topic( '09-the-four-part-prompt-recipe' )['audiences'] ), get_post_meta( $id, 'ita_audiences', true ) );
		$this->assertTrue( is_protected_meta( 'ita_level', 'post' ) );
		$this->assertTrue( is_protected_meta( 'ita_audiences', 'post' ) );
	}

	/** Posts installed before levels existed get ita_level/ita_audiences on the next run; nothing else changes. */
	public function test_a_rerun_backfills_missing_level_meta_without_touching_the_post(): void {
		$this->write( '09-the-four-part-prompt-recipe' );
		ideatoapps_blog_install();
		$id = ideatoapps_blog_find_starter( '09-the-four-part-prompt-recipe' );
		wp_update_post( array( 'ID' => $id, 'post_content' => 'Owner edit.' ) );
		delete_post_meta( $id, 'ita_level' );
		delete_post_meta( $id, 'ita_audiences' );
		$before = get_post( $id );
		$this->assertSame( array( 'created' => 0, 'skipped' => 1, 'errors' => 0, 'locked' => false ), ideatoapps_blog_install() );
		$this->assertSame( array( 'beginner' ), get_post_meta( $id, 'ita_level' ) );
		$this->assertSame( array( implode( ',', self::topic( '09-the-four-part-prompt-recipe' )['audiences'] ) ), get_post_meta( $id, 'ita_audiences' ) );
		$after = get_post( $id );
		$this->assertSame( array( $before->post_content, $before->post_status, $before->post_modified ), array( $after->post_content, $after->post_status, $after->post_modified ) );
		ideatoapps_blog_install();
		$this->assertCount( 1, get_post_meta( $id, 'ita_level' ), 'never added twice' );
	}

	public function test_backfill_keeps_existing_values_and_skips_posts_without_the_starter_slug(): void {
		$this->write( '01-what-ai-is-and-isnt' );
		$this->write( '27-what-is-an-ai-agent' );
		ideatoapps_blog_install();
		$kept = ideatoapps_blog_find_starter( '01-what-ai-is-and-isnt' );
		update_post_meta( $kept, 'ita_level', 'advanced' );
		delete_post_meta( $kept, 'ita_audiences' );
		$gone = ideatoapps_blog_find_starter( '27-what-is-an-ai-agent' );
		delete_post_meta( $gone, 'ita_starter_slug' );
		delete_post_meta( $gone, 'ita_level' );
		ideatoapps_blog_install();
		$this->assertSame( array( 'advanced' ), get_post_meta( $kept, 'ita_level' ), 'an existing value is not overwritten' );
		$this->assertCount( 1, get_post_meta( $kept, 'ita_audiences' ), 'the missing one is added' );
		$this->assertSame( array(), get_post_meta( $gone, 'ita_level' ), 'a post that lost its starter slug is left alone' );
	}
}
