<?php
require_once __DIR__ . '/SeoTestCase.php';

/**
 * The [ita_figure] shortcode: what it renders, what it refuses, nesting in [ita_why] and where its stylesheet loads (the SVG safety check
 * is in BlogSvgSafetyTest). Nothing here may ever render a PHP notice, a warning or a half-built figure.
 */
final class BlogFiguresTest extends SeoTestCase {
	private string $tmp = '';

	protected function tearDown(): void {
		remove_all_filters( 'ideatoapps_blog_art_dir' );
		wp_dequeue_style( 'ita-blog-art' );
		if ( '' !== $this->tmp && is_dir( $this->tmp ) ) {
			foreach ( glob( $this->tmp . '/*' ) ?: array() as $f ) {
				is_dir( $f ) && ! is_link( $f ) ? rmdir( $f ) : unlink( $f );
			}
			rmdir( $this->tmp );
		}
		parent::tearDown();
	}

	private function art_dir( string $kind ): string {
		return IDEATOAPPS_CORE_DIR . 'content/' . $kind;
	}

	/** Render and fail on any PHP notice, warning or deprecation. */
	private function render( string $content ): string {
		$problems = array();
		set_error_handler(
			static function ( $no, $str ) use ( &$problems ) {
				$problems[] = $str;
				return true;
			}
		);
		try {
			$html = do_shortcode( $content );
		} finally {
			restore_error_handler();
		}
		$this->assertSame( array(), $problems, 'PHP notices while rendering: ' . $content );
		return $html;
	}

	/** A throw-away art directory for the filter, filled with name => svg (a null value makes a folder named name.svg). */
	private function tmp_dir( array $files ): string {
		$this->tmp = sys_get_temp_dir() . '/ita-art-' . wp_generate_password( 8, false );
		mkdir( $this->tmp );
		foreach ( $files as $name => $svg ) {
			null === $svg ? mkdir( $this->tmp . "/$name.svg" ) : file_put_contents( $this->tmp . "/$name.svg", $svg );
		}
		add_filter( 'ideatoapps_blog_art_dir', fn() => $this->tmp );
		return $this->tmp;
	}

	private const GOOD = '<svg viewBox="0 0 10 10"><rect width="5" height="5" fill="var(--ita-fig-1)"/></svg>';

	/* The shortcode */

	public function test_shortcode_is_registered(): void {
		$this->assertTrue( shortcode_exists( 'ita_figure' ) );
	}

	public function test_figure_renders_inline_svg_with_caption_and_accessible_name(): void {
		$html = $this->render( '[ita_figure name="agent-loop" alt="An agent plans, acts, observes and checks, in a loop." caption="The agent loop."]' );
		$this->assertStringContainsString( '<figure class="ita-figure" data-testid="ita-figure">', $html );
		$this->assertMatchesRegularExpression( '/<svg\b[^>]*\brole="img"/', $html );
		$this->assertStringContainsString( 'aria-label="An agent plans, acts, observes and checks, in a loop."', $html );
		$this->assertStringContainsString( '<figcaption>The agent loop.</figcaption>', $html );
		$this->assertStringContainsString( 'viewBox="0 0', $html );
		$this->assertStringNotContainsString( '<?xml', $html );
		$this->assertDoesNotMatchRegularExpression( '/<svg\b[^>]*\s(width|height)=/', $html, 'CSS sizes the figure' );
		$this->assertStringContainsString( 'var(--ita-fig-', $html, 'colours come from CSS variables' );
		$this->assertStringContainsString( '</figure>', $html );
	}

	public function test_caption_is_optional_and_escaped(): void {
		$none = $this->render( '[ita_figure name="agent-loop" alt="A loop"]' );
		$this->assertStringContainsString( '<figure', $none );
		$this->assertStringNotContainsString( 'figcaption', $none );
		$html = $this->render( '[ita_figure name="agent-loop" alt="He said &quot;hi&quot; <b>x</b> & more" caption="<script>alert(1)</script>Cap & \'q\'"]' );
		$this->assertStringNotContainsString( '<script', $html );
		$this->assertStringNotContainsString( '<b>', $html );
		$this->assertStringContainsString( 'Cap &amp; &#039;q&#039;', $html );
		$this->assertMatchesRegularExpression( '/aria-label="He said &quot;hi&quot; x &amp; more"/', $html );
	}

	/** @return array<string, array{0:string}> */
	public static function nothing_cases(): array {
		return array(
			'unknown name'        => array( '[ita_figure name="nope" alt="A"]' ),
			'no name'             => array( '[ita_figure alt="A"]' ),
			'empty name'          => array( '[ita_figure name="" alt="A"]' ),
			'dot dot slash'       => array( '[ita_figure name="../x" alt="A"]' ),
			'deep traversal'      => array( '[ita_figure name="../../../../etc/passwd" alt="A"]' ),
			'slash'               => array( '[ita_figure name="figures/agent-loop" alt="A"]' ),
			'backslash'           => array( '[ita_figure name="..\\agent-loop" alt="A"]' ),
			'dots'                => array( '[ita_figure name=".." alt="A"]' ),
			'extension'           => array( '[ita_figure name="agent-loop.svg" alt="A"]' ),
			'uppercase'           => array( '[ita_figure name="Agent-Loop" alt="A"]' ),
			'space'               => array( '[ita_figure name="agent loop" alt="A"]' ),
			'encoded traversal'   => array( '[ita_figure name="%2e%2e%2fx" alt="A"]' ),
			'trailing newline'    => array( "[ita_figure name=\"agent-loop\n\" alt=\"A\"]" ),
			'missing alt'         => array( '[ita_figure name="agent-loop"]' ),
			'empty alt'           => array( '[ita_figure name="agent-loop" alt=""]' ),
			'blank alt'           => array( '[ita_figure name="agent-loop" alt="   "]' ),
			'tags-only alt'       => array( '[ita_figure name="agent-loop" alt="<b></b>"]' ),
			'overlong alt'        => array( '[ita_figure name="agent-loop" alt="' . str_repeat( 'a', 141 ) . '"]' ),
			'overlong multibyte'  => array( '[ita_figure name="agent-loop" alt="' . str_repeat( "\u{00e9}", 141 ) . '"]' ),
		);
	}

	#[\PHPUnit\Framework\Attributes\DataProvider( 'nothing_cases' )]
	public function test_bad_input_renders_nothing_and_no_notice( string $code ): void {
		$this->assertSame( '', $this->render( $code ) );
	}

	public function test_alt_of_exactly_140_characters_is_accepted(): void {
		$this->assertStringContainsString( '<figure', $this->render( '[ita_figure name="agent-loop" alt="' . str_repeat( 'a', 140 ) . '"]' ) );
	}

	public function test_the_name_must_be_in_the_allowlist_built_from_the_directory_listing(): void {
		$this->tmp_dir( array( 'only-one' => self::GOOD, 'a-folder' => null ) );
		$this->assertStringContainsString( '<figure', $this->render( '[ita_figure name="only-one" alt="A"]' ) );
		$this->assertSame( '', $this->render( '[ita_figure name="agent-loop" alt="A"]' ), 'not in this directory' );
		$this->assertSame( '', $this->render( '[ita_figure name="a-folder" alt="A"]' ), 'a folder called a-folder.svg is not a readable file' );
	}

	public function test_a_symlink_leading_outside_the_directory_is_refused(): void {
		$dir = $this->tmp_dir( array() );
		file_put_contents( $dir . '/../ita-outside.svg', self::GOOD );
		if ( ! @symlink( $dir . '/../ita-outside.svg', $dir . '/link.svg' ) ) {
			$this->markTestSkipped( 'cannot create symlinks here' );
		}
		$this->assertSame( '', $this->render( '[ita_figure name="link" alt="A"]' ) );
		unlink( $dir . '/../ita-outside.svg' );
	}

	public function test_a_file_that_fails_the_safety_check_renders_nothing(): void {
		$this->tmp_dir( array( 'bad' => (string) file_get_contents( __DIR__ . '/fixtures/svg-bad/malicious.svg' ), 'empty' => '' ) );
		$this->assertSame( '', $this->render( '[ita_figure name="bad" alt="A"]' ) );
		$this->assertSame( '', $this->render( '[ita_figure name="empty" alt="A"]' ) );
	}

	public function test_figure_works_inside_a_why_box_and_survives_its_filtering(): void {
		$html = apply_filters( 'the_content', "[ita_why title=\"More\"]\nSome text.\n\n[ita_figure name=\"agent-loop\" alt=\"A loop\" caption=\"Cap\"]\n\nMore text.\n[/ita_why]" );
		$this->assertMatchesRegularExpression( '#<details class="ita-why".*<figure class="ita-figure" data-testid="ita-figure"><svg\b.*</svg><figcaption>Cap</figcaption></figure>.*</details>#s', $html );
		$this->assertStringNotContainsString( 'ITAFIG', $html );
		$this->assertStringNotContainsString( '[ita_figure', $html );
		$this->assertStringContainsString( 'Some text.', $html );
		$this->assertStringContainsString( 'More text.', $html );
	}

	public function test_typed_figure_markup_inside_a_why_box_is_still_filtered(): void {
		$raw  = '<figure class="ita-figure" data-testid="ita-figure"><svg viewBox="0 0 1 1" onload="alert(1)"><script>alert(1)</script><rect width="1" height="1"/></svg><figcaption>x</figcaption></figure>';
		$html = apply_filters( 'the_content', "[ita_why title=\"More\"]\nBefore\n\n$raw\n\nAfter\n[/ita_why]" );
		$this->assertStringNotContainsString( '<svg', $html );
		$this->assertStringNotContainsString( '<script', $html );
		$this->assertStringNotContainsString( 'onload', $html );
		$this->assertStringNotContainsString( '<figure', $html );
		$this->assertStringContainsString( 'Before', $html );
		$real = apply_filters( 'the_content', "[ita_why]$raw\n\n[ita_figure name=\"agent-loop\" alt=\"A loop\"][/ita_why]" );
		$this->assertSame( 1, substr_count( $real, '<figure' ), 'only the shortcode output survives' );
		$this->assertStringNotContainsString( 'onload', $real );
	}

	public function test_a_bad_figure_inside_a_why_box_leaves_the_text_intact(): void {
		$html = apply_filters( 'the_content', '[ita_why]Before [ita_figure name="nope" alt="A"] after.[/ita_why]' );
		$this->assertStringContainsString( 'Before', $html );
		$this->assertStringContainsString( 'after.', $html );
		$this->assertStringNotContainsString( '<figure', $html );
	}

	public function test_the_art_stylesheet_loads_on_posts_and_the_blog_not_on_unrelated_pages(): void {
		$id = (int) wp_insert_post( array( 'post_status' => 'publish', 'post_title' => 'P', 'post_content' => 'x' ) );
		$this->go_to( get_permalink( $id ) );
		do_action( 'wp_enqueue_scripts' );
		$this->assertTrue( wp_style_is( 'ita-blog-art', 'enqueued' ) );
		wp_dequeue_style( 'ita-blog-art' );
		$page = (int) wp_insert_post( array( 'post_status' => 'publish', 'post_type' => 'page', 'post_title' => 'Plain page', 'post_content' => 'x' ) );
		$this->go_to( get_permalink( $page ) );
		do_action( 'wp_enqueue_scripts' );
		$this->assertFalse( wp_style_is( 'ita-blog-art', 'enqueued' ), 'a plain page does not need it' );
		$this->go_to( home_url( '/' ) );
		do_action( 'wp_enqueue_scripts' );
		$this->assertTrue( wp_style_is( 'ita-blog-art', 'enqueued' ), 'the posts index shows hero cards' );
	}
}
