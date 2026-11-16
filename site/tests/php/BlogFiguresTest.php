<?php
require_once __DIR__ . '/SeoTestCase.php';

/**
 * Original inline SVG for the blog: the [ita_figure] shortcode, the SVG safety check, the generated heroes and their theme wiring.
 * Nothing here may ever render a PHP notice, a warning or a half-built figure.
 */
final class BlogFiguresTest extends SeoTestCase {
	private const CONCEPT_FIGURES = array(
		'agent-loop', 'chatbot-answer-flow', 'token-splitting', 'context-window', 'training-stages', 'chatbot-workflow-agent',
		'tool-calling', 'agent-memory', 'guardrail-approval-flow', 'eval-loop', 'prompt-recipe', 'open-vs-closed',
	);

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

	/* The safety check */

	/** @return array<string, array{0:string}> */
	public static function unsafe_svgs(): array {
		$wrap = static fn( string $inner, string $attrs = '' ): string => '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"' . $attrs . '>' . $inner . '</svg>';
		return array(
			'script'                 => array( $wrap( '<script>alert(1)</script>' ) ),
			'script uppercase'       => array( $wrap( '<SCRIPT>alert(1)</SCRIPT>' ) ),
			'foreignObject'          => array( $wrap( '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>' ) ),
			'style with url'         => array( $wrap( '<style>rect{fill:url(https://evil.example/a)}</style>' ) ),
			'style with import'      => array( $wrap( '<style>@import "https://evil.example/a.css";</style>' ) ),
			'style element at all'   => array( $wrap( '<style>rect{fill:red}</style>' ) ),
			'onload on root'         => array( $wrap( '', ' onload="alert(1)"' ) ),
			'onclick on child'       => array( $wrap( '<rect width="1" height="1" onclick="x()"/>' ) ),
			'ONMOUSEOVER'            => array( $wrap( '<rect width="1" height="1" ONMOUSEOVER="x()"/>' ) ),
			'javascript href'        => array( $wrap( '<a href="javascript:alert(1)"><rect width="1" height="1"/></a>' ) ),
			'javascript with spaces' => array( $wrap( '<use href="jav&#x09;ascript:alert(1)"/>' ) ),
			'data url href'          => array( $wrap( '<use href="data:image/svg+xml;base64,AAAA"/>' ) ),
			'data url in style attr' => array( $wrap( '<rect width="1" height="1" style="fill:url(data:image/png;base64,AAAA)"/>' ) ),
			'external href'          => array( $wrap( '<use href="https://evil.example/x.svg#a"/>' ) ),
			'external xlink:href'    => array( $wrap( '<use xlink:href="//evil.example/x.svg#a"/>' ) ),
			'relative href'          => array( $wrap( '<use href="other.svg#a"/>' ) ),
			'src attribute'          => array( $wrap( '<rect src="https://evil.example/x"/>' ) ),
			'image'                  => array( $wrap( '<image href="#a" width="1" height="1"/>' ) ),
			'iframe'                 => array( $wrap( '<iframe src="https://evil.example"/>' ) ),
			'link element'           => array( $wrap( '<a href="#a"><rect width="1" height="1"/></a>' ) ),
			'animate'                => array( $wrap( '<animate attributeName="href" values="javascript:alert(1)"/>' ) ),
			'external fill url'      => array( $wrap( '<rect width="1" height="1" fill="url(https://evil.example/g)"/>' ) ),
			'doctype'                => array( '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' . $wrap( '' ) ),
			'entity'                 => array( '<!DOCTYPE svg [<!ENTITY x "boom">]>' . $wrap( '<text>&x;</text>' ) ),
			'stylesheet pi'          => array( '<?xml-stylesheet href="https://evil.example/a.css"?>' . $wrap( '' ) ),
			'fixed width'            => array( $wrap( '', ' width="400"' ) ),
			'fixed height'           => array( $wrap( '', ' height="300"' ) ),
			'no viewBox'             => array( '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>' ),
			'broken viewBox'         => array( '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 x y"><rect/></svg>' ),
			'root is not svg'        => array( '<html xmlns="http://www.w3.org/1999/xhtml"><body>x</body></html>' ),
			'nested svg'             => array( $wrap( '<svg viewBox="0 0 1 1"/>' ) ),
			'other namespace'        => array( $wrap( '<div xmlns="http://www.w3.org/1999/xhtml">x</div>' ) ),
			'not xml'                => array( '<svg viewBox="0 0 1 1"><rect></svg>' ),
			'empty'                  => array( '' ),
			'plain text'             => array( 'hello' ),
			'huge'                   => array( $wrap( str_repeat( '<rect width="1" height="1"/>', 4000 ) ) ),
		);
	}

	#[\PHPUnit\Framework\Attributes\DataProvider( 'unsafe_svgs' )]
	public function test_unsafe_svg_is_rejected_and_cleans_to_nothing( string $svg ): void {
		$this->assertFalse( ideatoapps_blog_svg_is_safe( $svg ) );
		$this->assertSame( '', ideatoapps_blog_svg_clean( $svg ) );
	}

	public function test_the_malicious_fixture_file_is_rejected(): void {
		$svg = (string) file_get_contents( __DIR__ . '/fixtures/svg-bad/malicious.svg' );
		$this->assertStringContainsString( '<script>', $svg, 'fixture is really malicious' );
		$this->assertFalse( ideatoapps_blog_svg_is_safe( $svg ) );
	}

	/** @return array<string, array{0:string}> */
	public static function safe_svgs(): array {
		return array(
			'minimal'          => array( '<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>' ),
			'with prolog'      => array( "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 480 240\"><title>T</title><desc>D</desc></svg>" ),
			'css variables'    => array( '<svg viewBox="0 0 10 10"><rect width="5" height="5" fill="var(--ita-fig-1)" stroke="var(--ita-fig-1-s)"/></svg>' ),
			'internal gradient' => array( '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs><rect width="5" height="5" fill="url(#g)"/></svg>' ),
			'internal use'     => array( '<svg viewBox="0 0 10 10"><defs><circle id="c" r="2"/></defs><use href="#c"/><use xlink:href="#c" xmlns:xlink="http://www.w3.org/1999/xlink"/></svg>' ),
			'text with "data:"' => array( '<svg viewBox="0 0 10 10" class="a b"><text aria-label="metadata is fine" x="1" y="1">Data: yes</text></svg>' ),
		);
	}

	#[\PHPUnit\Framework\Attributes\DataProvider( 'safe_svgs' )]
	public function test_ordinary_svg_passes_and_cleans_to_inline_markup( string $svg ): void {
		$this->assertTrue( ideatoapps_blog_svg_is_safe( $svg ) );
		$clean = ideatoapps_blog_svg_clean( $svg );
		$this->assertStringStartsWith( '<svg', $clean );
		$this->assertStringNotContainsString( '<?xml', $clean );
		$this->assertStringContainsString( 'viewBox="0 0', $clean );
		$this->assertTrue( ideatoapps_blog_svg_is_safe( $clean ), 'the cleaned markup is itself safe' );
	}

	public function test_clean_sets_the_given_root_attributes_and_keeps_the_rest(): void {
		$clean = ideatoapps_blog_svg_clean( '<svg viewBox="0 0 10 10" role="presentation" aria-label="old"><title>t</title><rect width="5" height="5" fill="var(--ita-fig-1)"/></svg>', array( 'role' => 'img', 'aria-label' => 'New "name" <b>' ) );
		$this->assertStringContainsString( 'role="img"', $clean );
		$this->assertStringNotContainsString( 'presentation', $clean );
		$this->assertStringContainsString( 'aria-label="New &quot;name&quot; &lt;b&gt;"', $clean );
		$this->assertStringContainsString( '<rect width="5" height="5" fill="var(--ita-fig-1)"/>', $clean );
		$this->assertStringContainsString( '<title>t</title>', $clean );
	}

	/* Every shipped file */

	/** @return string[] */
	private function shipped( string $kind ): array {
		return glob( $this->art_dir( $kind ) . '/*.svg' ) ?: array();
	}

	public function test_every_figure_and_hero_file_passes_the_safety_check(): void {
		$figures = $this->shipped( 'figures' );
		$heroes  = $this->shipped( 'heroes' );
		$this->assertGreaterThanOrEqual( 12, count( $figures ) );
		$this->assertGreaterThanOrEqual( 50, count( $heroes ) );
		foreach ( array_merge( $figures, $heroes ) as $file ) {
			$svg = (string) file_get_contents( $file );
			$this->assertTrue( ideatoapps_blog_svg_is_safe( $svg ), basename( $file ) . ' fails the safety check' );
			$this->assertMatchesRegularExpression( '/^[a-z0-9-]+\.svg$/', basename( $file ) );
		}
	}

	public function test_every_figure_has_a_title_and_a_description_and_stays_small(): void {
		foreach ( $this->shipped( 'figures' ) as $file ) {
			$svg = (string) file_get_contents( $file );
			$this->assertMatchesRegularExpression( '#<title>[^<]{3,}</title>#', $svg, basename( $file ) );
			$this->assertMatchesRegularExpression( '#<desc>[^<]{10,}</desc>#', $svg, basename( $file ) );
			$this->assertLessThanOrEqual( 4096, strlen( $svg ), basename( $file ) . ' is over 4 KB' );
			$this->assertStringNotContainsString( '#', preg_replace( '/url\(#|href="#/', '', $svg ), basename( $file ) . ': colours must be CSS variables, not hex' );
			$this->assertDoesNotMatchRegularExpression( '/\bid="/', $svg, basename( $file ) . ': ids would collide when a figure is used twice' );
		}
	}

	public function test_the_twelve_concept_figures_exist_and_render(): void {
		foreach ( self::CONCEPT_FIGURES as $name ) {
			$this->assertFileExists( $this->art_dir( 'figures' ) . "/$name.svg" );
			$this->assertStringContainsString( '<figure', $this->render( "[ita_figure name=\"$name\" alt=\"Diagram $name\"]" ), $name );
		}
	}
}
