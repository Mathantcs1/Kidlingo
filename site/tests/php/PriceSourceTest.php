<?php
require_once __DIR__ . '/CommerceTestCase.php';

/** The displayed price comes from the linked WooCommerce product, never from free text. */
final class PriceSourceTest extends CommerceTestCase {
	private function set_price( int $app, string $price, string $sale = '' ): void {
		$product = wc_get_product( (int) get_post_meta( $app, 'woo_product_id', true ) );
		$product->set_regular_price( $price );
		$product->set_sale_price( $sale );
		$product->save();
	}

	private function card( int $app ): string {
		ob_start();
		ideatoapps_part( 'app-card', array( 'app' => get_post( $app ) ) );
		return (string) ob_get_clean();
	}

	private function part( string $part ): string {
		ob_start();
		ideatoapps_part( $part );
		return (string) ob_get_clean();
	}

	public function test_button_card_and_label_follow_the_product_price_not_the_text_label(): void {
		$app = $this->app(); // the seed label says "$24.99 one-time".
		$this->add_version( $app, '1.0.0' );
		$this->assertSame( 'Buy ClipForge, $24.99 one-time', ideatoapps_app_buy_state( get_post( $app ) )['label'] );
		$this->set_price( $app, '31.50' );
		$this->assertSame( '$31.50 one-time', ideatoapps_app_price_text( $app ) );
		$this->assertSame( 'Buy ClipForge, $31.50 one-time', ideatoapps_app_buy_state( get_post( $app ) )['label'], 'Buy button' );
		$card = $this->card( $app );
		$this->assertStringContainsString( '$31.50 one-time', $card, 'card' );
		$this->assertStringNotContainsString( '24.99', $card );
		$this->set_price( $app, '40', '19' );
		$this->assertSame( '$19.00 one-time', ideatoapps_app_price_text( $app ), 'the active (sale) price is what is charged' );
	}

	public function test_label_is_only_the_fallback_when_there_is_no_usable_product(): void {
		$app = wp_insert_post( array( 'post_type' => 'app', 'post_title' => 'Plain', 'post_status' => 'publish', 'meta_input' => array( 'delivery_status' => 'live', 'price_label' => '$9 one-time' ) ) );
		$this->assertSame( '$9 one-time', ideatoapps_app_price_text( $app ), 'no product' );
		$product = new WC_Product_Simple();
		$product->set_name( 'Draft product' );
		$product->set_regular_price( '12' );
		$product->set_status( 'draft' );
		update_post_meta( $app, 'woo_product_id', $product->save() );
		$this->assertSame( '$9 one-time', ideatoapps_app_price_text( $app ), 'unpublished product' );
		$empty = new WC_Product_Simple();
		$empty->set_name( 'No price' );
		$empty->set_status( 'publish' );
		update_post_meta( $app, 'woo_product_id', $empty->save() );
		$this->assertSame( '$9 one-time', ideatoapps_app_price_text( $app ), 'product without a price' );
	}

	public function test_faq_and_terms_follow_the_clipforge_product_with_a_safe_fallback(): void {
		$this->assertStringContainsString( '$24.99 USD', wp_json_encode( ideatoapps_faq_items() ), 'no app yet: the launch price' );
		$app = $this->app();
		$this->assertStringContainsString( '$24.99 USD', wp_json_encode( ideatoapps_faq_items() ) );
		$this->set_price( $app, '31.50' );
		$faq = wp_json_encode( ideatoapps_faq_items() );
		$this->assertStringContainsString( '$31.50 USD', $faq );
		$this->assertStringNotContainsString( '24.99', $faq );
		$terms = $this->part( 'legal-terms' );
		$this->assertStringContainsString( '$31.50 USD', $terms );
		$this->assertStringNotContainsString( '24.99', $terms );
	}
}
