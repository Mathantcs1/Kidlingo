<?php
/**
 * Front-end confirm / unsubscribe page: /?ita_newsletter=confirm|unsubscribe&sid=ID&t=TOKEN.
 *
 * GET only shows a button, so an email link scanner that fetches the URL changes nothing. The POST (the button) performs the
 * change. It is authenticated by the signed token in the URL (no nonce, works for logged-out visitors) and rate limited.
 * Unsubscribe always works, even while sign-up is switched off.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Decide what a request does. Pure apart from the change a valid POST makes.
 *
 * @param string $method HTTP method; only exactly POST can change anything.
 * @param array  $query  Unslashed query string (ita_newsletter, sid, t).
 * @param array  $post   Unslashed form fields (ita_do).
 * @return array{status:int, view:string, action:string, id:int}
 */
function ideatoapps_newsletter_page_response( $method, array $query, array $post ) {
	$action = isset( $query['ita_newsletter'] ) && is_string( $query['ita_newsletter'] ) ? $query['ita_newsletter'] : '';
	$id     = isset( $query['sid'] ) && is_scalar( $query['sid'] ) ? absint( $query['sid'] ) : 0;
	$token  = isset( $query['t'] ) ? $query['t'] : '';
	$out    = static fn( $status, $view ) => array( 'status' => $status, 'view' => $view, 'action' => $action, 'id' => $id );
	$post_  = 'POST' === $method;
	if ( $post_ && ideatoapps_rate_limit_exceeded( 'newsletter_' . ( 'confirm' === $action ? 'confirm' : 'unsub' ) ) ) {
		return $out( 429, 'rate_limited' );
	}
	$check = ideatoapps_newsletter_token_check( $id, $action, $token );
	if ( 'ok' !== $check ) {
		return $out( 400, 'expired' === $check ? 'expired' : 'invalid' );
	}
	if ( 'ita_subscriber' !== get_post_type( $id ) ) {
		return $out( 200, 'gone' );
	}
	$status = ideatoapps_subscriber_status( $id );
	$do     = $post_ && isset( $post['ita_do'] ) && is_string( $post['ita_do'] ) ? $post['ita_do'] : '';
	if ( 'confirm' === $action ) {
		if ( 'unsubscribed' === $status && '' === (string) get_post_meta( $id, 'resubscribe_requested_at', true ) ) {
			return $out( 400, 'invalid' ); // opted out, and nobody asked to come back.
		}
		if ( $post_ && 'confirm' !== $do ) {
			return $out( 400, 'invalid' );
		}
		if ( ! $post_ ) {
			return $out( 200, 'confirmed' === $status ? 'confirmed' : 'confirm_form' );
		}
		if ( 'confirmed' !== $status ) {
			update_post_meta( $id, 'status', 'confirmed' );
			update_post_meta( $id, 'confirmed_at', gmdate( 'c' ) );
			delete_post_meta( $id, 'unsubscribed_at' );
			delete_post_meta( $id, 'resubscribe_requested_at' );
		}
		return $out( 200, 'confirmed' );
	}
	if ( ! $post_ ) {
		return $out( 200, 'unsubscribe_form' );
	}
	if ( 'delete' === $do ) {
		ideatoapps_delete_subscribers( array( $id ) );
		return $out( 200, 'deleted' );
	}
	if ( 'unsubscribe' !== $do ) {
		return $out( 400, 'invalid' );
	}
	if ( 'unsubscribed' !== $status ) {
		update_post_meta( $id, 'status', 'unsubscribed' );
		update_post_meta( $id, 'unsubscribed_at', gmdate( 'c' ) );
		delete_post_meta( $id, 'resubscribe_requested_at' ); // an opt-out withdraws any earlier comeback request.
	}
	return $out( 200, 'unsubscribed' );
}

/**
 * Response headers: never cached, never indexed, and no Referer (the token is in the URL).
 *
 * @return array<string, string>
 */
function ideatoapps_newsletter_page_headers() {
	return array(
		'Cache-Control'   => 'no-store, no-cache, must-revalidate, max-age=0, private',
		'Pragma'          => 'no-cache',
		'X-Robots-Tag'    => 'noindex, nofollow',
		'Referrer-Policy' => 'no-referrer',
	);
}

/**
 * Page body (inside the theme's header and footer).
 *
 * @param array $res   Result of ideatoapps_newsletter_page_response().
 * @param array $query Query of the request (unused: the form has no action, so it posts to the URL the browser is on).
 * @return string
 */
function ideatoapps_newsletter_page_html( array $res, array $query = array() ) { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter
	$view  = $res['view'];
	$texts = array(
		'confirm_form'     => array( __( 'Confirm your sign-up', 'ideatoapps-core' ), __( 'Press the button to confirm that you want to join the IdeaToApps newsletter list. Nothing changes until you do.', 'ideatoapps-core' ) ),
		'confirmed'        => array( __( 'You are confirmed', 'ideatoapps-core' ), __( 'Your address is confirmed for the IdeaToApps newsletter list. You can unsubscribe at any time with the link in our confirmation email.', 'ideatoapps-core' ) ),
		'unsubscribe_form' => array( __( 'Unsubscribe', 'ideatoapps-core' ), __( 'Plain Unsubscribe keeps only your email address, the status "unsubscribed" and the time, so we can honour your choice and never contact you again. To remove even that, choose "Unsubscribe and delete my data".', 'ideatoapps-core' ) ),
		'unsubscribed'     => array( __( 'You are unsubscribed', 'ideatoapps-core' ), __( 'We keep only your email address, the status and the time, so we can honour your choice. You can still delete that too with the link in our confirmation email.', 'ideatoapps-core' ) ),
		'deleted'          => array( __( 'Your data is deleted', 'ideatoapps-core' ), __( 'Your address and everything stored with it has been permanently deleted from this site.', 'ideatoapps-core' ) ),
		'gone'             => array( __( 'Nothing to change', 'ideatoapps-core' ), __( 'This address is not stored on our list (it may already have been deleted). If you still want to join, sign up again from the home page.', 'ideatoapps-core' ) ),
		'expired'          => array( __( 'This link has expired', 'ideatoapps-core' ), __( 'Confirmation links work for 7 days. Sign up again from the home page to get a new one.', 'ideatoapps-core' ) ),
		'rate_limited'     => array( __( 'Too many requests', 'ideatoapps-core' ), __( 'Please wait a minute and try again.', 'ideatoapps-core' ) ),
	);
	$title = $texts[ $view ][0] ?? __( 'This link is not valid', 'ideatoapps-core' );
	$text  = $texts[ $view ][1] ?? __( 'The link may be incomplete or out of date. Sign up again from the home page if you want to join the list.', 'ideatoapps-core' );
	$btn   = static fn( $do, $label, $cls ) => '<button class="btn btn--' . $cls . '" type="submit" name="ita_do" value="' . esc_attr( $do ) . '" data-testid="newsletter-' . esc_attr( $do ) . '-button">' . esc_html( $label ) . '</button>';
	$buttons = '';
	if ( 'confirm_form' === $view ) {
		$buttons = $btn( 'confirm', __( 'Confirm my sign-up', 'ideatoapps-core' ), 'primary' );
	} elseif ( 'unsubscribe_form' === $view ) {
		$buttons = $btn( 'unsubscribe', __( 'Unsubscribe', 'ideatoapps-core' ), 'primary' ) . ' ' . $btn( 'delete', __( 'Unsubscribe and delete my data', 'ideatoapps-core' ), 'secondary' );
	}
	$html  = '<article class="section page" data-testid="newsletter-page" data-view="' . esc_attr( $view ) . '"><div class="container container--narrow">';
	$html .= '<h1 class="section-heading__title">' . esc_html( $title ) . '</h1><div class="prose" data-testid="newsletter-result"><p>' . esc_html( $text ) . '</p>';
	if ( '' !== $buttons ) {
		$html .= '<form method="post">' . $buttons . '</form>';
	}
	return $html . '<p><a href="' . esc_url( home_url( '/' ) ) . '">' . esc_html__( 'Back to the home page', 'ideatoapps-core' ) . '</a></p></div></div></article>';
}

/**
 * Serve the page for ?ita_newsletter=... and stop.
 */
function ideatoapps_newsletter_template_redirect() {
	if ( ! isset( $_GET['ita_newsletter'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- authenticated by the signed token in the URL.
		return;
	}
	$method = isset( $_SERVER['REQUEST_METHOD'] ) ? strtoupper( sanitize_text_field( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) ) : 'GET';
	$query  = wp_unslash( $_GET ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$res    = ideatoapps_newsletter_page_response( $method, $query, wp_unslash( $_POST ) ); // phpcs:ignore WordPress.Security.NonceVerification.Missing -- token-authenticated.
	status_header( $res['status'] );
	nocache_headers();
	foreach ( ideatoapps_newsletter_page_headers() as $name => $value ) {
		header( $name . ': ' . $value );
	}
	add_filter( 'ideatoapps_seo_noindex', '__return_true' );
	add_filter( 'wp_robots', 'wp_robots_no_robots' );
	get_header();
	echo ideatoapps_newsletter_page_html( $res, $query ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped inside.
	get_footer();
	exit;
}
add_action( 'template_redirect', 'ideatoapps_newsletter_template_redirect', 1 );
