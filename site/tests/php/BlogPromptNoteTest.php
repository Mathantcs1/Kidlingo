<?php
use PHPUnit\Framework\TestCase;

/**
 * A prompt box with fill-in slots in [square brackets] gets one standard note above the box text. JSON arrays are not slots,
 * the note is never part of the copied text (the copy button copies only the <pre>), and it is printed once per box.
 */
final class BlogPromptNoteTest extends TestCase {
	private static function html( string $body ): string {
		return (string) apply_filters( 'the_content', '[ita_prompt title="T"]' . $body . '[/ita_prompt]' );
	}

	private static function copied( string $html ): string {
		return preg_match( '#<pre class="ita-prompt__text">(.*?)</pre>#s', $html, $m ) ? html_entity_decode( $m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8' ) : 'NO BOX';
	}

	public function test_detection_rule(): void {
		$slots = array( 'Write to [name] about [the date].', '{"city": "[your city]"}', 'Use [NAME]', 'Plan for [3 days]', "Line\n[topic]" );
		foreach ( $slots as $text ) {
			$this->assertTrue( ideatoapps_blog_prompt_has_slots( $text ), $text );
		}
		$none = array( 'No brackets here.', '{"tags": ["red", "blue"]}', '[1, 2, 3]', '[[1, 2], [3]]', '[{"a": "b"}, {"a": "c"}]', '[]', '[true, null]', 'Pick 1 [2] or 3' );
		foreach ( $none as $text ) {
			$this->assertFalse( ideatoapps_blog_prompt_has_slots( $text ), $text );
		}
	}

	public function test_box_with_slots_shows_the_note_once_and_outside_the_copied_text(): void {
		$html = self::html( "Write to [name].\nThen sign as [your name]." );
		$this->assertSame( 1, substr_count( $html, 'data-testid="ita-prompt-note"' ) );
		$this->assertStringContainsString( 'Replace the parts in [brackets] with your own details.', $html );
		$this->assertSame( "Write to [name].\nThen sign as [your name].", self::copied( $html ) );
		$this->assertLessThan( strpos( $html, '<pre' ), strpos( $html, 'ita-prompt-note' ), 'the note is above the box text' );
	}

	public function test_json_array_body_and_plain_body_have_no_note(): void {
		foreach ( array( "{\n  \"steps\": [\"read\", \"write\"],\n  \"limits\": [1, 2]\n}", 'Summarize this in three lines.' ) as $body ) {
			$html = self::html( $body );
			$this->assertStringNotContainsString( 'ita-prompt-note', $html, $body );
			$this->assertStringContainsString( 'ita-prompt__text', $html );
		}
	}
}
