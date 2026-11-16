<?php
/**
 * Test/dev only (mounted by scripts/wp-start.mjs, never packaged): the Playground site cannot send mail, so wp_mail() is
 * captured instead. GET /?rest_route=/ita-test/v1/mails (administrators only) returns the captured messages, newest last;
 * DELETE clears them. Nothing is ever sent.
 */
add_filter(
	'pre_wp_mail',
	static function ( $short, $atts ) {
		$list   = (array) get_option( 'ita_test_mails', array() );
		$list[] = array( 'to' => (array) $atts['to'], 'subject' => $atts['subject'], 'message' => $atts['message'], 'headers' => (array) $atts['headers'] );
		update_option( 'ita_test_mails', array_slice( $list, -30 ), false );
		return true;
	},
	10,
	2
);
add_action(
	'rest_api_init',
	static function () {
		register_rest_route(
			'ita-test/v1',
			'/mails',
			array(
				'methods'             => array( 'GET', 'DELETE' ),
				'permission_callback' => static fn() => current_user_can( 'manage_options' ),
				'callback'            => static function ( $request ) {
					$list = array_values( (array) get_option( 'ita_test_mails', array() ) );
					if ( 'DELETE' === $request->get_method() ) {
						delete_option( 'ita_test_mails' );
					}
					return rest_ensure_response( $list );
				},
			)
		);
	}
);
