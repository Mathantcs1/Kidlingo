<?php
/**
 * Front-end pages of the reading link: /?ita_reader=request (the "Email me a reading link" form and its neutral answer) and
 * /?ita_reader=read&sid=ID&t=TOKEN (GET shows a button; only the POST sets the reader cookie). Never cached, never indexed,
 * no Referer (the token is in the URL). Works without JavaScript.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Decide what a request does. Pure apart from what a valid POST changes.
 *
 * @param string $method HTTP method; only exactly POST changes anything.
 * @param array  $query  Unslashed query (ita_reader, sid, t, back).
 * @param array  $post   Unslashed form fields (email, back, ita_do).
 * @return array{status:int, view:string, back:int}
 */
function ideatoapps_reader_page_response( string $method, array $query, array $post ): array {
	$action = isset( $query['ita_reader'] ) && is_string( $query['ita_reader'] ) ? $query['ita_reader'] : '';
	$is_post = 'POST' === $method;
	if ( 'request' === $action ) {
		return $is_post ? ideatoapps_reader_link_request( $post ) : array( 'status' => 200, 'view' => 'request_form', 'back' => ideatoapps_reader_back( $query['back'] ?? 0 ) );
	}
	$back = ideatoapps_reader_back( $query['back'] ?? 0 );
	$out  = static fn( int $status, string $view ) => array( 'status' => $status, 'view' => $view, 'back' => $back );
	if ( 'read' !== $action ) {
		return $out( 400, 'invalid' );
	}
	if ( $is_post && ideatoapps_rate_limit_exceeded( 'reader_read' ) ) {
		return $out( 429, 'rate_limited' );
	}
	$sid   = isset( $query['sid'] ) && is_scalar( $query['sid'] ) ? absint( $query['sid'] ) : 0;
	$check = ideatoapps_reader_link_check( $sid, $query['t'] ?? '' );
	if ( 'ok' !== $check ) {
		return $out( 400, 'expired' === $check ? 'expired' : 'invalid' );
	}
	$issued = (int) strtok( (string) $query['t'], '.' );
	if ( (int) get_post_meta( $sid, 'read_link_used_at', true ) >= $issued ) {
		return $out( 400, 'used' );
	}
	if ( 'ita_subscriber' !== get_post_type( $sid ) || 'confirmed' !== ideatoapps_subscriber_status( $sid ) ) {
		return $out( 403, 'not_subscribed' );
	}
	if ( ! $is_post ) {
		return $out( 200, 'read_form' );
	}
	if ( ! isset( $post['ita_do'] ) || 'read' !== $post['ita_do'] ) {
		return $out( 400, 'invalid' );
	}
	update_post_meta( $sid, 'read_link_used_at', $issued );
	ideatoapps_reader_set_cookie( $sid );
	return $out( 200, 'unlocked' );
}

/**
 * The "Email me a reading link" form (gate card and request page). A plain POST: works without JavaScript.
 *
 * @param int    $back   Post to come back to.
 * @param string $prefix Id prefix (unique on the page).
 * @param string $error  Error text to show with the field ('' for none).
 */
function ideatoapps_reader_link_form_html( int $back, string $prefix = 'gate-link', string $error = '' ): string {
	$p     = sanitize_html_class( $prefix );
	$err   = '' !== $error ? '<p class="form__error" id="' . $p . '-error" data-testid="gate-link-error">' . esc_html( $error ) . '</p>' : '';
	$attrs = '' !== $error ? ' aria-invalid="true" aria-describedby="' . $p . '-error"' : '';
	$html  = '<form class="gate-link newsletter__form" method="post" action="' . esc_url( add_query_arg( 'ita_reader', 'request', home_url( '/' ) ) ) . '" data-testid="gate-link-form">';
	$html .= '<label for="' . $p . '-email">' . esc_html__( 'Email address', 'ideatoapps-core' ) . '</label>' . $err;
	$html .= '<div class="newsletter__row"><input class="field" type="email" id="' . $p . '-email" name="email" autocomplete="email" required' . $attrs . '>';
	$html .= '<input type="hidden" name="back" value="' . esc_attr( (string) $back ) . '">';
	$html .= '<button class="btn btn--secondary" type="submit">' . esc_html__( 'Email me a reading link', 'ideatoapps-core' ) . '</button></div></form>';
	return $html;
}

/**
 * Page body (inside the theme's header and footer).
 *
 * @param array $res Result of ideatoapps_reader_page_response().
 */
function ideatoapps_reader_page_html( array $res ): string {
	$view  = (string) $res['view'];
	$back  = (int) ( $res['back'] ?? 0 );
	$texts = array(
		'request_form'   => array( __( 'Email me a reading link', 'ideatoapps-core' ), __( 'Already subscribed? Enter your address and, if it is a confirmed subscriber, we email it a link that unlocks subscriber-only articles in your browser.', 'ideatoapps-core' ) ),
		'bad_email'      => array( __( 'Email me a reading link', 'ideatoapps-core' ), __( 'Enter a valid email address.', 'ideatoapps-core' ) ),
		'link_sent'      => array( __( 'Check your inbox', 'ideatoapps-core' ), __( 'If this address is a confirmed subscriber, we have emailed it a reading link. The link works for one day. Nothing arrived after a few minutes? Check your spam folder, or sign up on any subscriber-only article.', 'ideatoapps-core' ) ),
		'read_form'      => array( __( 'Unlock subscriber-only articles', 'ideatoapps-core' ), __( 'Press the button to read subscriber-only articles in this browser. Nothing changes until you do.', 'ideatoapps-core' ) ),
		'unlocked'       => array( __( 'You can read every article', 'ideatoapps-core' ), __( 'Subscriber-only articles are unlocked in this browser. If you unsubscribe, they lock again.', 'ideatoapps-core' ) ),
		'used'           => array( __( 'This link was already used', 'ideatoapps-core' ), __( 'Each reading link works once. Ask for a new one from any subscriber-only article.', 'ideatoapps-core' ) ),
		'expired'        => array( __( 'This link has expired', 'ideatoapps-core' ), __( 'Reading links work for one day. Ask for a new one from any subscriber-only article.', 'ideatoapps-core' ) ),
		'not_subscribed' => array( __( 'Not a confirmed subscriber', 'ideatoapps-core' ), __( 'This address is not (or no longer) a confirmed subscriber. Sign up again on any subscriber-only article to read it.', 'ideatoapps-core' ) ),
		'unavailable'    => array( __( 'Nothing to unlock', 'ideatoapps-core' ), __( 'Every article is open to read right now.', 'ideatoapps-core' ) ),
		'rate_limited'   => array( __( 'Too many requests', 'ideatoapps-core' ), __( 'Please wait a minute and try again.', 'ideatoapps-core' ) ),
	);
	$title = $texts[ $view ][0] ?? __( 'This link is not valid', 'ideatoapps-core' );
	$text  = $texts[ $view ][1] ?? __( 'The link may be incomplete or out of date. Ask for a new one from any subscriber-only article.', 'ideatoapps-core' );
	$html  = '<article class="section page" data-testid="reader-page" data-view="' . esc_attr( $view ) . '"><div class="container container--narrow">';
	$html .= '<h1 class="section-heading__title">' . esc_html( $title ) . '</h1><div class="prose" data-testid="reader-result">';
	if ( 'request_form' === $view || 'bad_email' === $view ) {
		$html .= 'bad_email' === $view ? '' : '<p>' . esc_html( $text ) . '</p>';
		$html .= ideatoapps_reader_link_form_html( $back, 'reader-link', 'bad_email' === $view ? $text : '' );
	} else {
		$html .= '<p>' . esc_html( $text ) . '</p>';
	}
	if ( 'read_form' === $view ) {
		$html .= '<form method="post"><button class="btn btn--primary" type="submit" name="ita_do" value="read" data-testid="reader-read-button">' . esc_html__( 'Unlock articles in this browser', 'ideatoapps-core' ) . '</button></form>';
	}
	$to    = $back > 0 ? array( (string) get_permalink( $back ), __( 'Back to the article', 'ideatoapps-core' ) ) : array( home_url( '/blog/' ), __( 'Go to the blog', 'ideatoapps-core' ) );
	$html .= '<p><a href="' . esc_url( $to[0] ) . '" data-testid="reader-back">' . esc_html( $to[1] ) . '</a></p>';
	return $html . '</div></div></article>';
}

/**
 * Serve /?ita_reader=... and stop.
 */
function ideatoapps_reader_template_redirect(): void {
	if ( ! isset( $_GET['ita_reader'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- token-authenticated / neutral form.
		return;
	}
	$method = isset( $_SERVER['REQUEST_METHOD'] ) ? strtoupper( sanitize_text_field( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) ) : 'GET';
	$res    = ideatoapps_reader_page_response( $method, wp_unslash( $_GET ), wp_unslash( $_POST ) ); // phpcs:ignore WordPress.Security.NonceVerification -- see the file comment.
	status_header( $res['status'] );
	nocache_headers();
	if ( ! defined( 'DONOTCACHEPAGE' ) ) {
		define( 'DONOTCACHEPAGE', true ); // page caches (LiteSpeed, WP Super Cache, ...) skip this page, as they do gated posts.
	}
	foreach ( ideatoapps_newsletter_page_headers() as $name => $value ) {
		header( $name . ': ' . $value );
	}
	add_filter( 'ideatoapps_seo_noindex', '__return_true' );
	add_filter( 'wp_robots', 'wp_robots_no_robots' );
	get_header();
	echo ideatoapps_reader_page_html( $res ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped inside.
	get_footer();
	exit;
}
add_action( 'template_redirect', 'ideatoapps_reader_template_redirect', 1 );
