<?php
use PHPUnit\Framework\TestCase;

/**
 * [ita_why] through the real the_content pipeline. With the opening and closing tags on their own lines (how every article writes
 * it), wpautop + shortcode_unautop leave "</p>" right after the opening tag and "<p>" right before the closing one, so the
 * shortcode's content starts with a stray </p> and ends with an unclosed <p>. The box must drop them.
 */
final class BlogWhyRenderTest extends TestCase {
	private static function body( string $markup ): string {
		$html = (string) apply_filters( 'the_content', $markup );
		return preg_match( '#<div class="ita-why__body">(.*?)</div></details>#s', $html, $m ) ? $m[1] : 'NO BOX';
	}

	/** @return array<string, array{string}> */
	public static function layouts(): array {
		return array(
			'own lines (articles)'   => array( "<p>Intro.</p>\n[ita_why title=\"W\"]\n<p>First.</p>\n<p>Second.</p>\n[/ita_why]\n<p>After.</p>" ),
			'blank lines around'     => array( "<p>Intro.</p>\n\n[ita_why title=\"W\"]\n<p>First.</p>\n<p>Second.</p>\n[/ita_why]\n\n<p>After.</p>" ),
			'opening on the p line'  => array( "<p>Intro.</p>\n[ita_why title=\"W\"]<p>First.</p>\n<p>Second.</p>\n[/ita_why]\n<p>After.</p>" ),
		);
	}

	#[\PHPUnit\Framework\Attributes\DataProvider( 'layouts' )]
	public function test_the_box_body_is_balanced_paragraphs_only( string $markup ): void {
		$body = trim( self::body( $markup ) );
		$this->assertSame( "<p>First.</p>\n<p>Second.</p>", $body );
	}

	public function test_plain_text_and_lists_survive(): void {
		$this->assertSame( 'Plain words', trim( self::body( "<p>Intro.</p>\n[ita_why title=\"W\"]\nPlain words\n[/ita_why]\n<p>After.</p>" ) ) );
		$list = trim( self::body( "<p>Intro.</p>\n[ita_why title=\"W\"]\n<ul>\n<li>One</li>\n<li>Two</li>\n</ul>\n[/ita_why]\n<p>After.</p>" ) );
		$this->assertStringStartsWith( '<ul>', $list );
		$this->assertStringEndsWith( '</ul>', $list );
		$this->assertStringNotContainsString( '<p></p>', $list );
	}

	public function test_the_edge_cleaner_only_removes_stray_edges_and_empty_paragraphs(): void {
		$this->assertSame( '<p>a</p><p>b</p>', ideatoapps_blog_unautop_edges( "</p>\n<p>a</p><p> </p><p>b</p>\n<p>" ) );
		$this->assertSame( '<p>keep</p>', ideatoapps_blog_unautop_edges( '<p>keep</p>' ) );
		$this->assertSame( 'text <p>x</p>', ideatoapps_blog_unautop_edges( 'text <p>x</p>' ) );
	}
}
