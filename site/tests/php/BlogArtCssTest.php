<?php
use PHPUnit\Framework\TestCase;

/**
 * The figure palette in assets/blog-art.css: text colours must stay readable on every fill and on the figure background, in both themes.
 * (Pure CSS parsing, no WordPress.)
 */
final class BlogArtCssTest extends TestCase {
	private static function lum( string $hex ): float {
		$c = array_map( static fn( $h ) => hexdec( $h ) / 255, str_split( ltrim( $hex, '#' ), 2 ) );
		$c = array_map( static fn( $v ) => $v <= 0.03928 ? $v / 12.92 : ( ( $v + 0.055 ) / 1.055 ) ** 2.4, $c );
		return 0.2126 * $c[0] + 0.7152 * $c[1] + 0.0722 * $c[2];
	}

	private static function ratio( string $a, string $b ): float {
		$x = self::lum( $a );
		$y = self::lum( $b );
		return ( max( $x, $y ) + 0.05 ) / ( min( $x, $y ) + 0.05 );
	}

	/** @return array<string,string> Variables of the block for a theme. */
	private static function vars( string $theme ): array {
		$css   = (string) file_get_contents( dirname( __DIR__, 2 ) . '/wp-content/plugins/ideatoapps-core/assets/blog-art.css' );
		$start = 'light' === $theme ? strpos( $css, ':root[data-theme="light"] {' ) : strpos( $css, ':root {' );
		$end   = strpos( $css, '}', (int) $start );
		preg_match_all( '/(--ita-fig-[a-z0-9-]+):\s*(#[0-9a-f]{6})/i', substr( $css, (int) $start, (int) $end - (int) $start ), $m, PREG_SET_ORDER );
		return array_column( $m, 2, 1 );
	}

	/** @return array<string, array{0:string}> */
	public static function themes(): array {
		return array( 'dark' => array( 'dark' ), 'light' => array( 'light' ) );
	}

	#[\PHPUnit\Framework\Attributes\DataProvider( 'themes' )]
	public function test_ink_and_muted_text_have_4_5_to_1_on_every_fill_and_ink_on_the_background( string $theme ): void {
		$v = self::vars( $theme );
		foreach ( array( 'ink', 'muted' ) as $text ) {
			foreach ( array( 1, 2, 3, 4, 5 ) as $n ) {
				$this->assertGreaterThanOrEqual( 4.5, self::ratio( $v[ "--ita-fig-$text" ], $v[ "--ita-fig-$n" ] ), "$theme: $text on fill $n" );
			}
		}
		// The figure background is --bg-alt of the theme (#111c46 dark, #eef2fc light).
		$bg = 'light' === $theme ? '#eef2fc' : '#111c46';
		$this->assertGreaterThanOrEqual( 4.5, self::ratio( $v['--ita-fig-ink'], $bg ) );
		$this->assertGreaterThanOrEqual( 4.5, self::ratio( $v['--ita-fig-muted'], $bg ) );
	}
}
