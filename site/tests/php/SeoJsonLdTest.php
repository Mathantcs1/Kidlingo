<?php
require_once __DIR__ . '/SeoTestCase.php';

final class SeoJsonLdTest extends SeoTestCase {
	/** A live, sellable ClipForge: seeded app, product at 24.99, one valid version. */
	private function sellable(): int {
		$app = $this->app();
		$this->add_version( $app, '1.0.0' );
		return $app;
	}

	public function test_sellable_app_has_the_real_offer_and_the_facts_we_hold(): void {
		$ld = ideatoapps_app_jsonld( $this->sellable() );
		$this->assertSame( 'https://schema.org', $ld['@context'] );
		$this->assertSame( 'SoftwareApplication', $ld['@type'] );
		$this->assertSame( 'ClipForge', $ld['name'] );
		$this->assertSame( 'https://ideatoapps.net/apps/clipforge/', $ld['url'] );
		$this->assertStringContainsString( 'Edit videos in your browser', $ld['description'] );
		$this->assertSame( 'Creator', $ld['applicationCategory'] );
		$this->assertStringContainsString( 'Chromium-based desktop browser', $ld['operatingSystem'] );
		$this->assertSame( '1.0.0', $ld['softwareVersion'] );
		$this->assertSame( 'Offer', $ld['offers']['@type'] );
		$this->assertSame( '24.99', $ld['offers']['price'] );
		$this->assertSame( 'USD', $ld['offers']['priceCurrency'] );
		$this->assertSame( 'https://schema.org/InStock', $ld['offers']['availability'] );
	}

	public function test_url_uses_the_constant_origin_not_the_request_host(): void {
		$_SERVER['HTTP_HOST'] = 'evil.example';
		$ld                   = ideatoapps_app_jsonld( $this->sellable() );
		unset( $_SERVER['HTTP_HOST'] );
		$this->assertStringStartsWith( 'https://ideatoapps.net/', $ld['url'] );
	}

	public function test_no_offer_without_a_real_buyable_state_and_no_invented_fields(): void {
		$app = $this->app(); // live but no version/zip yet: the buy button is "Coming soon", so no offer either.
		$ld  = ideatoapps_app_jsonld( $app );
		$this->assertArrayNotHasKey( 'offers', $ld );
		$this->assertArrayNotHasKey( 'softwareVersion', $ld );

		$soon = $this->make_app( 'Soon App', 'coming_soon' );
		$ld   = ideatoapps_app_jsonld( $soon );
		$this->assertSame( array( '@context', '@type', 'name', 'url' ), array_keys( $ld ), 'only fields that exist' );
	}

	public function test_hidden_or_unpublished_apps_have_no_schema(): void {
		$draft = $this->make_app( 'Hidden', 'draft' );
		$this->assertSame( array(), ideatoapps_app_jsonld( $draft ) );
		$this->assertSame( array(), ideatoapps_app_jsonld( 0 ) );
		$this->assertSame( array(), ideatoapps_app_jsonld( $this->make_page( 'x', 'X' ) ) );
	}

	public function test_featured_image_is_used_when_present(): void {
		$app = $this->make_app( 'With image', 'coming_soon' );
		$att = $this->zip_attachment( 'shot.png', base64_decode( 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' ) );
		wp_update_post( array( 'ID' => $att, 'post_mime_type' => 'image/png' ) );
		set_post_thumbnail( $app, $att );
		$this->assertStringContainsString( 'shot', ideatoapps_app_jsonld( $app )['image'] );
	}

	public function test_rating_and_review_data_is_stripped_recursively(): void {
		$dirty = array(
			'name'            => 'X',
			'aggregateRating' => array( 'ratingValue' => 5 ),
			'Review'          => array( '@type' => 'Review' ),
			'offers'          => array(
				'price'           => '1',
				'aggregateRating' => array( 'ratingValue' => 4.9 ),
				'nested'          => array( array( 'review' => 'great', 'ok' => 'kept', 'x' => array( 'ratingCount' => 7, 'bestRating' => 5 ) ) ),
				'node'            => array( '@type' => 'AggregateRating', 'ratingValue' => 5 ),
				'list'            => array( array( '@type' => 'Review', 'reviewBody' => 'hi' ), 'keep' ),
			),
		);
		$clean = ideatoapps_strip_rating_data( $dirty );
		$json  = strtolower( wp_json_encode( $clean ) );
		foreach ( array( 'aggregaterating', 'review', 'ratingvalue', 'ratingcount', 'bestrating' ) as $bad ) {
			$this->assertStringNotContainsString( $bad, $json, $bad );
		}
		$this->assertSame( 'kept', $clean['offers']['nested'][0]['ok'] );
		$this->assertSame( array( 'keep' ), $clean['offers']['list'] );
		$this->assertSame( '1', $clean['offers']['price'] );
		$this->assertSame( $dirty['name'], $clean['name'] );
	}

	public function test_filter_output_with_nested_ratings_never_reaches_the_page_json(): void {
		$app    = $this->sellable();
		$inject = static function ( array $ld ): array {
			$ld['offers']['aggregateRating'] = array( 'ratingValue' => 5 );
			$ld['author']                    = array( '@type' => 'Person', 'review' => array( 'x' ) );
			return $ld;
		};
		add_filter( 'ideatoapps_app_jsonld', $inject );
		$direct = ideatoapps_app_jsonld( $app );
		$seam   = ideatoapps_app_schema( $app ); // the theme seam the single-app template prints.
		remove_filter( 'ideatoapps_app_jsonld', $inject );
		foreach ( array( $direct, $seam ) as $ld ) {
			$json = strtolower( wp_json_encode( $ld ) );
			foreach ( array( 'aggregaterating', 'ratingvalue', '"review"', 'review' ) as $bad ) {
				$this->assertStringNotContainsString( $bad, $json, $bad );
			}
		}
		$this->assertSame( '24.99', $seam['offers']['price'], 'the plugin fills the theme seam' );
	}

	public function test_theme_seam_strips_nested_ratings_from_any_filter(): void {
		$inject = static fn(): array => array( 'name' => 'Y', 'deep' => array( array( 'aggregateRating' => 1, 'keep' => 1 ) ) );
		add_filter( 'ideatoapps_app_schema', $inject, 99 );
		$out = ideatoapps_app_schema( 1 );
		remove_filter( 'ideatoapps_app_schema', $inject, 99 );
		$this->assertSame( array( 'keep' => 1 ), $out['deep'][0] );
	}

	public function test_site_jsonld_has_organization_and_website_without_fabricated_links(): void {
		$ld = ideatoapps_site_jsonld();
		$by = array();
		foreach ( $ld['@graph'] as $node ) {
			$by[ $node['@type'] ] = $node;
		}
		$this->assertSame( 'IdeaToApps', $by['Organization']['name'] );
		$this->assertSame( 'https://ideatoapps.net/', $by['Organization']['url'] );
		$this->assertStringContainsString( 'icon-512', $by['Organization']['logo'] );
		$this->assertArrayNotHasKey( 'sameAs', $by['Organization'], 'no channel set, so no social links' );
		$this->assertSame( 'IdeaToApps', $by['WebSite']['name'] );
		$this->assertSame( 'https://ideatoapps.net/', $by['WebSite']['url'] );
		$this->assertArrayNotHasKey( 'potentialAction', $by['WebSite'], 'no SearchAction' );

		update_option( 'ideatoapps_youtube_channel_url', 'https://www.youtube.com/@ideatoapps' );
		$org = ideatoapps_site_jsonld()['@graph'][0];
		$this->assertSame( array( 'https://www.youtube.com/@ideatoapps' ), $org['sameAs'] );
		$this->assertStringNotContainsString( 'aggregaterating', strtolower( wp_json_encode( ideatoapps_site_jsonld() ) ) );
	}
}
