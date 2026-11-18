<?php
/**
 * Sender address for the plugin's own emails (newsletter confirmation, reading link, contact notification). Owner setting
 * (Settings > IdeaToApps), same-domain only, never printed on the site. Applied only inside ideatoapps_with_sender(), so
 * WooCommerce and other plugins' mail is untouched.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

const IDEATOAPPS_MAIL_FROM_NAME_MAX = 80;

/**
 * The site's host without a leading "www.", lower case.
 *
 * @return string
 */
function ideatoapps_mail_site_domain() {
	$host = strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
	return 0 === strpos( $host, 'www.' ) ? substr( $host, 4 ) : $host;
}

/**
 * Whether an address' domain is the site's domain, or a parent domain of it (at least two labels, so never a bare TLD).
 *
 * @param string $email Address.
 * @return bool
 */
function ideatoapps_mail_domain_allowed( $email ) {
	$at = strrpos( $email, '@' );
	if ( false === $at ) {
		return false;
	}
	$domain = strtolower( substr( $email, $at + 1 ) );
	$domain = 0 === strpos( $domain, 'www.' ) ? substr( $domain, 4 ) : $domain;
	$site   = ideatoapps_mail_site_domain();
	if ( '' === $domain || '' === $site || false === strpos( $domain, '.' ) ) {
		return false;
	}
	return $domain === $site || substr( $site, -strlen( $domain ) - 1 ) === '.' . $domain;
}

/**
 * A clean sender address: '' for empty, null when refused (line breaks, brackets, commas, not an address, other domain).
 *
 * @param mixed $value Raw value.
 * @return string|null
 */
function ideatoapps_mail_normalise_email( $value ) {
	$value = is_string( $value ) ? trim( $value ) : '';
	if ( '' === $value ) {
		return '';
	}
	if ( 1 === preg_match( '/[\x00-\x20\x7F<>,;"\'()\[\]\\\\]/', $value ) ) {
		return null;
	}
	$clean = sanitize_email( $value );
	if ( $clean !== $value || ! is_email( $clean ) || ! ideatoapps_mail_domain_allowed( $clean ) ) {
		return null;
	}
	return $clean;
}

/**
 * A clean sender name: '' for empty, null when refused (line breaks, control characters, brackets, commas, over 80 characters).
 *
 * @param mixed $value Raw value.
 * @return string|null
 */
function ideatoapps_mail_normalise_name( $value ) {
	$value = is_string( $value ) ? $value : '';
	if ( 1 === preg_match( '/[\x00-\x08\x0A-\x1F\x7F<>,]/', $value ) ) {
		return null;
	}
	$clean = trim( preg_replace( '/\s+/', ' ', sanitize_text_field( $value ) ) );
	return mb_strlen( $clean ) > IDEATOAPPS_MAIL_FROM_NAME_MAX ? null : $clean;
}

/**
 * register_setting sanitiser: a refused value leaves the stored one in place.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function ideatoapps_sanitize_mail_from_email( $value ) {
	$clean = ideatoapps_mail_normalise_email( $value );
	return null === $clean ? (string) get_option( 'ideatoapps_mail_from_email', '' ) : $clean;
}

/**
 * register_setting sanitiser for the name; a refused value leaves the stored one in place.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function ideatoapps_sanitize_mail_from_name( $value ) {
	$clean = ideatoapps_mail_normalise_name( $value );
	return null === $clean ? (string) get_option( 'ideatoapps_mail_from_name', '' ) : $clean;
}

/**
 * Register the two options (called from ideatoapps_register_settings).
 */
function ideatoapps_register_mail_sender_settings() {
	register_setting( 'ideatoapps', 'ideatoapps_mail_from_email', array( 'type' => 'string', 'sanitize_callback' => 'ideatoapps_sanitize_mail_from_email', 'default' => '', 'show_in_rest' => false ) );
	register_setting( 'ideatoapps', 'ideatoapps_mail_from_name', array( 'type' => 'string', 'sanitize_callback' => 'ideatoapps_sanitize_mail_from_name', 'default' => '', 'show_in_rest' => false ) );
}

/**
 * Save the sender section of the settings form. Both fields are refused together; the old values stay.
 *
 * @param array $post Unslashed form fields.
 * @return array<string, string> Errors by key.
 */
function ideatoapps_save_mail_sender( array $post ) {
	$email = ideatoapps_mail_normalise_email( $post['mail_from_email'] ?? '' );
	$name  = ideatoapps_mail_normalise_name( $post['mail_from_name'] ?? '' );
	if ( null === $email || null === $name ) {
		return array( 'invalid_sender' => __( 'The sender for site emails was not saved: use one plain address on this site\'s own domain (no line breaks, brackets or commas) and a name of up to 80 characters without commas. The previous sender was kept.', 'ideatoapps-core' ) );
	}
	update_option( 'ideatoapps_mail_from_email', $email, false );
	update_option( 'ideatoapps_mail_from_name', $name, false );
	return array();
}

/**
 * The sender address to use now: stored, re-checked against the current site domain; '' when unset or no longer valid.
 *
 * @return string
 */
function ideatoapps_mail_from_email() {
	$email = ideatoapps_mail_normalise_email( get_option( 'ideatoapps_mail_from_email', '' ) );
	return (string) $email;
}

/**
 * The sender name to use now ('' keeps WordPress's default name).
 *
 * @return string
 */
function ideatoapps_mail_from_name() {
	return (string) ideatoapps_mail_normalise_name( get_option( 'ideatoapps_mail_from_name', '' ) );
}

/**
 * Run a callable (the wp_mail call) with the owner's sender applied. The filters (priority 99) exist only while it runs and are
 * removed in a finally block, so other mail is untouched. The envelope sender (Return-Path) is set to the same address.
 *
 * @param callable $fn The wp_mail call.
 * @return mixed What the callable returns.
 */
function ideatoapps_with_sender( callable $fn ) {
	$email = ideatoapps_mail_from_email();
	if ( '' === $email ) {
		return $fn();
	}
	$name     = ideatoapps_mail_from_name();
	$from     = static fn() => $email;
	$sender   = static function ( $phpmailer ) use ( $email ) {
		$phpmailer->Sender = $email;
	};
	$from_name = static fn() => $name;
	add_filter( 'wp_mail_from', $from, 99 );
	if ( '' !== $name ) {
		add_filter( 'wp_mail_from_name', $from_name, 99 );
	}
	add_action( 'phpmailer_init', $sender, 99 );
	try {
		return $fn();
	} finally {
		remove_filter( 'wp_mail_from', $from, 99 );
		remove_filter( 'wp_mail_from_name', $from_name, 99 );
		remove_action( 'phpmailer_init', $sender, 99 );
	}
}
