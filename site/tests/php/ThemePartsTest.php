<?php
final class ThemePartsTest extends WPTestCase {
	private function render( string $name, array $args = array() ): string {
		ob_start();
		ideatoapps_part( $name, $args );
		return (string) ob_get_clean();
	}

	public function test_part_receives_args_and_escapes_output(): void {
		$html = $this->render( 'button', array( 'label' => '<b>Go</b>', 'href' => 'https://example.com/x' ) );
		$this->assertStringContainsString( 'class="btn btn--primary"', $html );
		$this->assertStringContainsString( '&lt;b&gt;Go&lt;/b&gt;', $html );
		$this->assertStringContainsString( 'href="https://example.com/x"', $html );
	}

	public function test_button_without_href_is_a_button_and_variant_is_whitelisted(): void {
		$html = $this->render( 'button', array( 'label' => 'Save', 'variant' => 'evil" onclick="x', 'type' => 'submit' ) );
		$this->assertStringStartsWith( '<button class="btn btn--primary"', $html );
		$this->assertStringContainsString( 'type="submit"', $html );
		$this->assertStringNotContainsString( 'onclick', $html );
	}

	public function test_card_and_section_heading_render(): void {
		$card = $this->render( 'card', array( 'title' => 'Demo', 'href' => '/apps/demo/', 'text' => 'Hi', 'heading' => 9 ) );
		$this->assertStringContainsString( '<h4 class="card__title">', $card );
		$this->assertStringContainsString( 'href="/apps/demo/"', $card );
		$heading = $this->render( 'section-heading', array( 'title' => 'Apps', 'eyebrow' => 'New', 'level' => 1 ) );
		$this->assertStringContainsString( '<h1 class="section-heading__title">Apps</h1>', $heading );
	}

	public function test_unknown_or_traversal_part_renders_nothing(): void {
		$this->assertSame( '', $this->render( 'does-not-exist' ) );
		$this->assertSame( '', $this->render( '../functions' ) );
	}

	public function test_footer_links_and_no_learn_in_header(): void {
		$this->assertSame( array( 'Apps', 'Learn', 'Blog', 'About', 'Contact', 'Privacy', 'Terms', 'Refund' ), array_column( ideatoapps_footer_links(), 'label' ) );
		$this->assertSame( array( 'Apps', 'Blog', 'About' ), array_column( ideatoapps_primary_links(), 'label' ) );
	}
}
