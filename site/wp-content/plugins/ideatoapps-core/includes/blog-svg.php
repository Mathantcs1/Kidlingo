<?php
/**
 * Inline SVG for the blog: a strict safety check, a cleaner that returns markup fit to print inside a page, and a reader that
 * only ever opens files from the plugin's content/figures and content/heroes folders. The art is original and ships with the plugin;
 * the check exists so a file added or edited later can never carry script, event handlers or external references.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

const IDEATOAPPS_SVG_NS       = 'http://www.w3.org/2000/svg';
const IDEATOAPPS_SVG_MAX_SIZE = 65536;

/** Elements an SVG may contain. Anything else (script, style, foreignObject, image, a, animate, iframe...) makes it unsafe. */
const IDEATOAPPS_SVG_ELEMENTS = array(
	'svg', 'g', 'defs', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
	'linearGradient', 'radialGradient', 'stop', 'clipPath', 'symbol', 'use',
);

/**
 * Parse SVG text into a DOM without loading anything from outside. Null when it is empty, too big, has a DOCTYPE, entity or
 * processing instruction (other than the XML prolog), or is not well-formed XML.
 *
 * @param string $svg SVG source.
 * @return DOMDocument|null
 */
function ideatoapps_blog_svg_parse( string $svg ): ?DOMDocument {
	$svg = (string) preg_replace( '/\A\xEF\xBB\xBF/', '', $svg );
	if ( '' === trim( $svg ) || strlen( $svg ) > IDEATOAPPS_SVG_MAX_SIZE || false !== strpos( $svg, "\0" ) ) {
		return null;
	}
	if ( 1 === preg_match( '/<!\s*(?:DOCTYPE|ENTITY|ELEMENT|ATTLIST|NOTATION)/i', $svg ) ) {
		return null;
	}
	$body = (string) preg_replace( '/\A\s*<\?xml(?=\s)[^?]*\?>/i', '', $svg, 1 );
	if ( false !== strpos( $body, '<?' ) ) {
		return null;
	}
	$previous = libxml_use_internal_errors( true );
	$doc      = new DOMDocument();
	$loaded   = $doc->loadXML( $body, LIBXML_NONET | LIBXML_NOBLANKS ); // no LIBXML_NOENT / DTDLOAD: nothing is expanded or fetched.
	libxml_clear_errors();
	libxml_use_internal_errors( $previous );
	return $loaded && $doc->documentElement instanceof DOMElement ? $doc : null;
}

/**
 * Whether one attribute is allowed: no event handlers, links only to #fragments, no script or data URLs, no external url().
 *
 * @param DOMAttr $attr Attribute.
 * @return bool
 */
function ideatoapps_blog_svg_attr_ok( DOMAttr $attr ): bool {
	$name = strtolower( $attr->nodeName );
	if ( 1 !== preg_match( '/\A[a-z][a-z0-9:_.-]*\z/', $name ) || 0 === strpos( $name, 'on' ) || 0 === strpos( strtolower( (string) $attr->localName ), 'on' ) || in_array( strtolower( (string) $attr->localName ), array( 'src', 'style' ), true ) ) {
		return false;
	}
	$ns = (string) $attr->namespaceURI;
	if ( '' !== $ns && ! ( 'http://www.w3.org/1999/xlink' === $ns && 'href' === $attr->localName ) && ! ( 'http://www.w3.org/XML/1998/namespace' === $ns && in_array( $attr->localName, array( 'space', 'lang' ), true ) ) ) {
		return false;
	}
	$value = (string) $attr->value;
	if ( 'style' === $name || false !== strpos( $value, '\\' ) ) {
		return false; // inline styles and CSS escapes (u\72l(...)) can hide a url(); shipped art uses presentation attributes only.
	}
	if ( 'href' === $attr->localName && 1 !== preg_match( '/\A#[A-Za-z_][\w.-]*\z/', trim( $value ) ) ) {
		return false; // href, xlink:href and any prefix bound to either: fragment references only.
	}
	$flat = strtolower( (string) preg_replace( '/[\x00-\x20\x7f]+/', '', $value ) );
	if ( 1 === preg_match( '/javascript:|vbscript:|@import|expression\(|\Adata:|[(,;"\'=]data:/', $flat ) ) {
		return false;
	}
	return 1 !== preg_match( '/url\((?![\'"]?#)/', $flat ); // url(#gradient) is fine, url(anything else) is not.
}

/**
 * Whether an element and everything below it is allowed.
 *
 * @param DOMNode $node  Node.
 * @param int     $depth Nesting depth (capped).
 * @return bool
 */
function ideatoapps_blog_svg_node_ok( DOMNode $node, int $depth = 0 ): bool {
	if ( $depth > 14 ) {
		return false;
	}
	if ( $node instanceof DOMText || $node instanceof DOMComment ) { // DOMCdataSection is a DOMText.
		return true;
	}
	if ( ! $node instanceof DOMElement || '' !== (string) $node->prefix ) {
		return false; // processing instructions, entity references, prefixed elements.
	}
	$ns = (string) $node->namespaceURI;
	if ( ( '' !== $ns && IDEATOAPPS_SVG_NS !== $ns ) || ! in_array( $node->localName, IDEATOAPPS_SVG_ELEMENTS, true ) || ( $depth > 0 && 'svg' === $node->localName ) ) {
		return false;
	}
	foreach ( $node->attributes as $attr ) {
		if ( ! $attr instanceof DOMAttr || ! ideatoapps_blog_svg_attr_ok( $attr ) ) {
			return false;
		}
	}
	foreach ( $node->childNodes as $child ) {
		if ( ! ideatoapps_blog_svg_node_ok( $child, $depth + 1 ) ) {
			return false;
		}
	}
	return true;
}

/**
 * Whether the SVG text is safe to print inline: a real <svg> root with a viewBox and no fixed width or height, and only
 * allowed elements and attributes below it (see ideatoapps_blog_svg_node_ok()).
 *
 * @param string $svg SVG source.
 * @return bool
 */
function ideatoapps_blog_svg_is_safe( string $svg ): bool {
	$doc  = ideatoapps_blog_svg_parse( $svg );
	$root = $doc ? $doc->documentElement : null;
	if ( ! $root instanceof DOMElement || 'svg' !== $root->localName || $root->hasAttribute( 'width' ) || $root->hasAttribute( 'height' ) ) {
		return false;
	}
	if ( 1 !== preg_match( '/\A\s*-?[\d.]+[\s,]+-?[\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*\z/', $root->getAttribute( 'viewBox' ), $box ) || (float) $box[1] <= 0 || (float) $box[2] <= 0 ) {
		return false;
	}
	return ideatoapps_blog_svg_node_ok( $root );
}

/**
 * Serialise one checked node as HTML5-inline markup (no prolog, no comments, no namespace declarations).
 *
 * @param DOMNode              $node  Node.
 * @param array<string,string> $extra Attributes to set on this element, replacing any of the same name.
 * @return string
 */
function ideatoapps_blog_svg_emit( DOMNode $node, array $extra = array() ): string {
	if ( $node instanceof DOMText ) {
		return htmlspecialchars( $node->data, ENT_XML1 | ENT_QUOTES, 'UTF-8' );
	}
	if ( ! $node instanceof DOMElement ) {
		return '';
	}
	$attrs = array();
	foreach ( $node->attributes as $attr ) {
		$attrs[ $attr->nodeName ] = (string) $attr->value;
	}
	$attrs = array_merge( $attrs, $extra );
	$out   = '<' . $node->localName;
	foreach ( $attrs as $name => $value ) {
		$out .= ' ' . $name . '="' . htmlspecialchars( (string) $value, ENT_XML1 | ENT_QUOTES, 'UTF-8' ) . '"';
	}
	$inner = '';
	foreach ( $node->childNodes as $child ) {
		$inner .= ideatoapps_blog_svg_emit( $child );
	}
	return '' === $inner ? $out . '/>' : $out . '>' . $inner . '</' . $node->localName . '>';
}

/**
 * The SVG as markup for printing inside a page, or '' when it is not safe.
 *
 * @param string               $svg        SVG source.
 * @param array<string,string> $root_attrs Attributes put on the <svg> element (for example role and aria-label).
 * @return string
 */
function ideatoapps_blog_svg_clean( string $svg, array $root_attrs = array() ): string {
	if ( ! ideatoapps_blog_svg_is_safe( $svg ) ) {
		return '';
	}
	$doc = ideatoapps_blog_svg_parse( $svg );
	return $doc ? ideatoapps_blog_svg_emit( $doc->documentElement, $root_attrs ) : '';
}
