<?php
/**
 * SEO foundations: the canonical origin, app structured data (SoftwareApplication JSON-LD) and the rating/review filter.
 *
 * Decision (Task 9): no SEO plugin is installed on this site, so this plugin ships its own minimal SEO output (seo-head.php,
 * seo-robots.php, seo-site-schema.php). Every piece is skipped when a known SEO plugin is active or `ideatoapps_seo_enabled`
 * returns false, so one can take over later without double output.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/** The one public origin of the site. Canonical links, og:url and JSON-LD page URLs are built on it, never on the request host. */
if ( ! defined( 'IDEATOAPPS_CANONICAL_ORIGIN' ) ) {
	define( 'IDEATOAPPS_CANONICAL_ORIGIN', 'https://ideatoapps.net' );
}

/**
 * The canonical origin without a trailing slash. Only a local test run may override it, through the clearly named filter.
 */
function ideatoapps_canonical_origin(): string {
	return untrailingslashit( (string) apply_filters( 'ideatoapps_canonical_origin_local_testing_only', IDEATOAPPS_CANONICAL_ORIGIN ) );
}

/**
 * Canonical URL for a path (and optional query) on this site.
 *
 * @param string $path Path starting with a slash; a full URL is reduced to its path and query.
 */
function ideatoapps_canonical_url( string $path = '/' ): string {
	$parts = wp_parse_url( $path );
	$out   = isset( $parts['path'] ) ? '/' . ltrim( $parts['path'], '/' ) : '/';
	if ( ! empty( $parts['query'] ) ) {
		$out .= '?' . $parts['query'];
	}
	return ideatoapps_canonical_origin() . $out;
}

/**
 * Remove every rating and review property from structured data, at any depth. The site has no real ratings to claim.
 * Dropped: keys that start with rating/review/aggregateRating (plus best/worstRating) and any node typed Rating, Review or AggregateRating.
 *
 * @param array $data Structured data.
 * @return array The same data without rating or review parts.
 */
function ideatoapps_strip_rating_data( array $data ): array {
	$is_list = ideatoapps_is_list( $data );
	$out     = array();
	foreach ( $data as $key => $value ) {
		if ( is_string( $key ) && 1 === preg_match( '/^(aggregate)?(rating|review)|^(best|worst)rating$/i', $key ) ) {
			continue;
		}
		if ( is_array( $value ) ) {
			$type = $value['@type'] ?? '';
			foreach ( (array) $type as $one ) {
				if ( is_string( $one ) && 1 === preg_match( '/(rating|review)$/i', $one ) ) {
					continue 2;
				}
			}
			$value = ideatoapps_strip_rating_data( $value );
		}
		$out[ $key ] = $value;
	}
	return $is_list ? array_values( $out ) : $out;
}

/**
 * The real offer of an app: only a live, sellable app linked to a published WooCommerce product with a price.
 * Price and currency come from the product, so changing the price in WooCommerce changes the structured data.
 *
 * @param int $app_id App post ID.
 * @return array Offer node, or an empty array when nothing is for sale.
 */
function ideatoapps_app_jsonld_offer( int $app_id ): array {
	if ( 'live' !== get_post_meta( $app_id, 'delivery_status', true ) || ! function_exists( 'ideatoapps_app_is_sellable' ) || ! ideatoapps_app_is_sellable( $app_id ) ) {
		return array();
	}
	$product = ideatoapps_app_product( $app_id );
	$price   = $product ? (string) $product->get_price() : '';
	if ( '' === $price || ! is_numeric( $price ) || ! function_exists( 'get_woocommerce_currency' ) ) {
		return array();
	}
	return array(
		'@type'         => 'Offer',
		'price'         => number_format( (float) $price, 2, '.', '' ),
		'priceCurrency' => get_woocommerce_currency(),
		'availability'  => $product->is_in_stock() ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
		'url'           => ideatoapps_canonical_url( (string) get_permalink( $app_id ) ),
	);
}

/**
 * SoftwareApplication structured data for one app page. Only fields we really hold are included.
 *
 * @param int $app_id App post ID.
 * @return array Empty for an app that is not public.
 */
function ideatoapps_app_jsonld( int $app_id ): array {
	$app = get_post( $app_id );
	if ( ! $app instanceof WP_Post || 'app' !== $app->post_type || 'publish' !== $app->post_status
		|| ! in_array( get_post_meta( $app_id, 'delivery_status', true ), array( 'live', 'coming_soon' ), true ) ) {
		return array();
	}
	$ld          = array(
		'@context' => 'https://schema.org',
		'@type'    => 'SoftwareApplication',
		'name'     => get_the_title( $app ),
		'url'      => ideatoapps_canonical_url( (string) get_permalink( $app ) ),
	);
	$description = trim( (string) get_post_meta( $app_id, 'tagline', true ) );
	$description = '' !== $description ? $description : trim( wp_strip_all_tags( $app->post_excerpt ) );
	$terms       = wp_get_post_terms( $app_id, 'app_category', array( 'fields' => 'names' ) );
	$platforms   = trim( (string) get_post_meta( $app_id, 'platforms', true ) );
	$versions    = ideatoapps_get_versions( $app_id );
	$image       = has_post_thumbnail( $app ) ? wp_get_attachment_image_url( (int) get_post_thumbnail_id( $app ), 'large' ) : '';
	$offer       = ideatoapps_app_jsonld_offer( $app_id );
	$optional    = array(
		'description'         => $description,
		'applicationCategory' => is_array( $terms ) && $terms ? (string) $terms[0] : '',
		'operatingSystem'     => $platforms,
		'softwareVersion'     => $versions ? (string) $versions[0]['version'] : '',
		'image'               => $image ? (string) $image : '',
		'offers'              => $offer,
	);
	$ld         += array_filter( $optional );
	$ld          = apply_filters( 'ideatoapps_app_jsonld', $ld, $app_id );
	return is_array( $ld ) ? ideatoapps_strip_rating_data( $ld ) : array();
}

// Fill the single-app template's structured-data seam (theme: ideatoapps_app_schema()).
add_filter(
	'ideatoapps_app_schema',
	static function ( $schema, $app_id ) {
		return $schema ? $schema : ideatoapps_app_jsonld( (int) $app_id );
	},
	10,
	2
);
