<?php
require_once __DIR__ . '/ReaderTestCase.php';

/**
 * Operational parts of the reader gate: page caches are purged when the newsletter switch or a post's "Subscribers only" box changes;
 * reading-link mail volume is capped per subscriber per day and site-wide per hour (same answer either way); the confirm page and
 * the card only claim what is true; the sign-up records newsletter consent separately (export keyed on it).
 */
final class ReaderOpsTest extends ReaderTestCase {
	/** @var array<string, int> */
	private array $fired = array();

	private function listen(): void {
		foreach ( array( 'litespeed_purge_all', 'litespeed_purge_post', 'ideatoapps_reader_caches_purged' ) as $hook ) {
			add_action(
				$hook,
				function () use ( $hook ) {
					$this->fired[ $hook ] = ( $this->fired[ $hook ] ?? 0 ) + 1;
				}
			);
		}
	}

	public function test_switching_the_newsletter_purges_page_caches(): void {
		$this->listen();
		update_option( 'ideatoapps_newsletter_enabled', false );
		$this->assertSame( 1, $this->fired['litespeed_purge_all'] ?? 0 );
		update_option( 'ideatoapps_newsletter_enabled', true );
		$this->assertSame( 2, $this->fired['litespeed_purge_all'] ?? 0 );
		delete_option( 'ideatoapps_newsletter_enabled' );
		add_option( 'ideatoapps_newsletter_enabled', true );
		$this->assertSame( 3, $this->fired['litespeed_purge_all'] ?? 0, 'the first save adds the option' );
	}

	public function test_changing_the_box_purges_that_post_and_the_rest_but_an_unchanged_save_does_not(): void {
		wp_set_current_user( self::make_user( 'administrator' ) );
		$id   = (int) wp_insert_post( array( 'post_title' => 'P', 'post_status' => 'publish' ) );
		$form = static fn( bool $on ) => array( 'ita_gate_nonce' => wp_create_nonce( 'ita_gate_' . $id ), 'ita_gate_present' => '1' ) + ( $on ? array( 'ita_gated' => '1' ) : array() );
		$this->listen();
		ideatoapps_gate_save_box( $id, $form( true ) );
		$this->assertSame( 1, $this->fired['litespeed_purge_post'] ?? 0 );
		$this->assertSame( 1, $this->fired['litespeed_purge_all'] ?? 0 );
		ideatoapps_gate_save_box( $id, $form( true ) );
		$this->assertSame( 1, $this->fired['litespeed_purge_post'] ?? 0, 'unchanged' );
		ideatoapps_gate_save_box( $id, $form( false ) );
		$this->assertSame( 2, $this->fired['litespeed_purge_post'] ?? 0 );
	}

	public function test_reading_links_are_capped_at_three_a_day_per_subscriber_with_the_same_answer(): void {
		$sid = $this->subscriber( 'confirmed', 'cap@example.com' );
		$answers = array();
		for ( $i = 0; $i < 5; $i++ ) {
			$_SERVER['REMOTE_ADDR'] = '198.51.100.' . ( 10 + $i );
			delete_post_meta( $sid, 'read_link_sent_at' ); // pretend the 10-minute wait has passed.
			$answers[] = ideatoapps_reader_page_response( 'POST', array( 'ita_reader' => 'request' ), array( 'email' => 'cap@example.com' ) );
			ideatoapps_reader_link_flush_queue();
		}
		$this->assertCount( 3, $this->mails );
		$this->assertCount( 1, array_unique( array_map( 'serialize', $answers ) ), 'identical answers' );
	}

	public function test_a_site_wide_hourly_cap_stops_reading_link_mail(): void {
		$this->subscriber( 'confirmed', 'hour@example.com' );
		update_option( 'ideatoapps_reader_link_hour', gmdate( 'YmdH' ) . ':' . IDEATOAPPS_READER_LINK_HOURLY_CAP, false );
		$res = ideatoapps_reader_page_response( 'POST', array( 'ita_reader' => 'request' ), array( 'email' => 'hour@example.com' ) );
		ideatoapps_reader_link_flush_queue();
		$this->assertSame( array( 200, 'link_sent' ), array( $res['status'], $res['view'] ) );
		$this->assertSame( array(), $this->mails );
		update_option( 'ideatoapps_reader_link_hour', '2000010100:' . IDEATOAPPS_READER_LINK_HOURLY_CAP, false );
		ideatoapps_reader_page_response( 'POST', array( 'ita_reader' => 'request' ), array( 'email' => 'hour@example.com' ) );
		ideatoapps_reader_link_flush_queue();
		$this->assertCount( 1, $this->mails, 'a new hour starts a new count' );
	}

	public function test_the_confirm_page_mentions_subscriber_only_articles_only_when_one_is_gated(): void {
		$sentence = 'Subscriber-only articles open in the browser where you pressed Confirm';
		$res      = array( 'status' => 200, 'view' => 'confirmed', 'action' => 'confirm', 'id' => 1 );
		$this->assertStringNotContainsString( $sentence, ideatoapps_newsletter_page_html( $res ) );
		$id = $this->gated_post();
		$this->assertStringContainsString( $sentence, ideatoapps_newsletter_page_html( $res ) );
		update_option( 'ideatoapps_newsletter_enabled', false );
		$this->assertStringNotContainsString( $sentence, ideatoapps_newsletter_page_html( $res ), 'switch off' );
		update_option( 'ideatoapps_newsletter_enabled', true );
		wp_update_post( array( 'ID' => $id, 'post_status' => 'draft' ) );
		$this->assertStringNotContainsString( $sentence, ideatoapps_newsletter_page_html( $res ), 'only published posts count' );
	}

	public function test_the_card_does_not_claim_this_browser_is_unlocked(): void {
		ob_start();
		ideatoapps_part( 'gate-card', array( 'post_id' => 0 ) );
		$card = (string) ob_get_clean();
		$this->assertStringContainsString( 'the browser where you open the confirmation link can read', $card );
		$this->assertStringNotContainsString( 'this browser can read', $card );
	}

	public function test_new_signups_record_newsletter_consent_and_the_export_skips_rows_without_it(): void {
		$req = new WP_REST_Request( 'POST', '/ideatoapps/v1/newsletter' );
		$req->set_header( 'X-WP-Nonce', wp_create_nonce( 'wp_rest' ) );
		$req->set_body_params( array( 'email' => 'flag@example.com', 'consent' => '1' ) );
		$this->assertSame( 200, rest_do_request( $req )->get_status() );
		$id = ideatoapps_find_subscriber( 'flag@example.com' );
		$this->assertSame( '1', (string) get_post_meta( $id, 'newsletter_consent', true ) );
		update_post_meta( $id, 'status', 'confirmed' );
		$legacy = $this->subscriber( 'confirmed', 'legacy@example.com' );
		$read   = $this->subscriber( 'confirmed', 'readonly@example.com' );
		update_post_meta( $read, 'newsletter_consent', '0' );
		$emails = array_column( ita_subscribers( 'confirmed' ), 'email' );
		$this->assertContains( 'flag@example.com', $emails );
		$this->assertContains( 'legacy@example.com', $emails, 'rows from before the flag consented (the box was required)' );
		$this->assertNotContains( 'readonly@example.com', $emails, 'a reading-only row is never exported' );
		$this->with_cookie( $read );
		$this->assertSame( $read, ideatoapps_reader_current_subscriber(), 'the gate stays keyed on confirmed status' );
		unset( $legacy );
	}
}
