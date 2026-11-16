<?php
require_once __DIR__ . '/SeoTestCase.php';

/**
 * The inline-SVG safety check and cleaner, and lints over every shipped figure and hero file.
 */
final class BlogSvgSafetyTest extends SeoTestCase {
	private const CONCEPT_FIGURES = array(
		'agent-loop', 'chatbot-answer-flow', 'token-splitting', 'context-window', 'training-stages', 'chatbot-workflow-agent',
		'tool-calling', 'agent-memory', 'guardrail-approval-flow', 'eval-loop', 'prompt-recipe', 'open-vs-closed',
	);

	private function art_dir( string $kind ): string {
		return IDEATOAPPS_CORE_DIR . 'content/' . $kind;
	}

	private function render( string $content ): string {
		return do_shortcode( $content );
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
			'style attribute'        => array( $wrap( '<rect width="1" height="1" style="fill:red"/>' ) ),
			'css escape in style'    => array( $wrap( '<rect width="1" height="1" style="fill:u\\72l(http://evil.example/a)"/>' ) ),
			'backslash in any attr'  => array( $wrap( '<rect width="1" height="1" fill="u\\72l(http://evil.example/a)"/>' ) ),
			'prefixed external href' => array( $wrap( '<use xmlns:q="http://www.w3.org/1999/xlink" q:href="https://evil.example/x.svg#a"/>' ) ),
			'prefixed relative href' => array( $wrap( '<use xmlns:q="http://www.w3.org/1999/xlink" q:href="other.svg#a"/>' ) ),
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
			'prefixed internal href' => array( '<svg viewBox="0 0 10 10" xmlns:q="http://www.w3.org/1999/xlink"><defs><circle id="c" r="2"/></defs><use q:href="#c"/></svg>' ),
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

	/**
	 * Inline SVG shares one page with everything else, so an id in one file can collide with another figure (the same figure twice,
	 * several card heroes) and url(#x), href="#x" and <use> would then point at the wrong thing. Shipped art therefore has no ids,
	 * no <defs> and no internal references at all: draw shapes directly.
	 */
	public function test_shipped_art_has_no_ids_or_internal_references(): void {
		$files = array_merge( $this->shipped( 'figures' ), $this->shipped( 'heroes' ) );
		$this->assertNotEmpty( $files );
		foreach ( $files as $file ) {
			$svg = (string) file_get_contents( $file );
			$this->assertDoesNotMatchRegularExpression( '/\sid\s*=/i', $svg, basename( $file ) . ' has an id' );
			$this->assertDoesNotMatchRegularExpression( '/url\(\s*[\'"]?#/i', $svg, basename( $file ) . ' has url(#...)' );
			$this->assertDoesNotMatchRegularExpression( '/<(use|defs|symbol|clipPath|linearGradient|radialGradient)\b/', $svg, basename( $file ) );
			$this->assertDoesNotMatchRegularExpression( '/href\s*=/i', $svg, basename( $file ) );
			$this->assertDoesNotMatchRegularExpression( '/\sstyle\s*=/i', $svg, basename( $file ) );
		}
	}
}
