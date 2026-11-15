<?php
require_once __DIR__ . '/CommerceTestCase.php';

/** Review round 1: unlinked zips are protected too, Stripe missing testmode is live, version attachment rule. */
final class CommerceProtectTest extends CommerceTestCase {
	private function unlinked_app(): int {
		return wp_insert_post( array( 'post_type' => 'app', 'post_title' => 'Spare App', 'post_status' => 'publish' ) );
	}

	private function protected_root(): string {
		return realpath( wp_upload_dir()['basedir'] ) . '/woocommerce_uploads/ideatoapps/';
	}

	public function test_version_added_before_the_product_is_linked_is_still_protected_then_linking_syncs_the_moved_file(): void {
		$app = $this->unlinked_app();
		$att = $this->zip_attachment( 'early.zip' );
		$pub = get_attached_file( $att );
		$this->assertTrue( ideatoapps_add_version( $app, '1.0.0', 'x', $att ) );
		$moved = get_attached_file( $att );
		$this->assertStringStartsWith( $this->protected_root(), $moved, 'moved although no product resolves' );
		$this->assertFileDoesNotExist( $pub, 'no public copy' );
		$this->assertSame( 'private', get_post_status( $att ) );
		$this->assertSame( 0, (int) get_post( $att )->post_parent );
		// The REST media list for visitors queries attachments with status 'inherit' (a live rest_do_request here leaks into later full-page renders, so the same query is run directly).
		$listed = get_posts( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'numberposts' => -1, 'fields' => 'ids' ) );
		$this->assertNotContains( $att, array_map( 'intval', $listed ), 'not in the public media list' );


		$product = new WC_Product_Simple();
		$product->set_name( 'Spare' );
		$product->set_status( 'publish' );
		$product->save();
		update_post_meta( $app, 'woo_product_id', $product->get_id() );
		$this->assertSame( $moved, get_attached_file( $att ), 'linking later does not move it again' );
		$files = wc_get_product( $product->get_id() )->get_downloads();
		$this->assertCount( 1, $files );
		$this->assertStringEndsWith( substr( $moved, strlen( dirname( $this->protected_root() ) ) - strlen( 'ideatoapps' ) ), (string) reset( $files )->get_file() );
		$this->assertStringContainsString( '/woocommerce_uploads/ideatoapps/', (string) reset( $files )->get_file() );
		$this->assertSame( $moved, ideatoapps_protect_attachment_file( $att ), 'idempotent' );
	}

	public function test_a_zip_is_protected_at_upload_even_if_it_is_never_saved_to_a_version(): void {
		$att  = $this->zip_attachment( 'never-saved.zip' );
		$path = get_attached_file( $att );
		$this->assertStringStartsWith( $this->protected_root(), $path, 'in the protected folder straight away' );
		$this->assertFileExists( $path );
		$this->assertFileDoesNotExist( wp_upload_dir()['path'] . '/never-saved.zip', 'no public copy' );
		$this->assertSame( 'private', get_post_status( $att ) );
		$public = get_posts( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'post_mime_type' => 'application/zip', 'numberposts' => -1, 'fields' => 'ids' ) );
		$this->assertNotContains( $att, array_map( 'intval', $public ), 'not in the anonymous media list (/wp/v2/media?mime_type=application/zip)' );
	}

	public function test_non_zip_uploads_stay_where_they_are_and_public(): void {
		$up  = wp_upload_bits( 'pic.png', null, 'x' );
		$img = (int) wp_insert_attachment( array( 'post_mime_type' => 'image/png', 'post_title' => 'p', 'post_status' => 'inherit' ), $up['file'] );
		$this->assertNotSame( 'private', get_post_status( $img ) );
		$this->assertStringNotContainsString( 'woocommerce_uploads', (string) get_attached_file( $img ) );
	}

	public function test_a_zip_protected_at_upload_still_links_to_a_version_and_keeps_the_buyer_file_name(): void {
		$app = $this->app();
		$att = $this->zip_attachment( 'my upload (3).zip' );
		$dir = dirname( get_attached_file( $att ) );
		$this->assertTrue( ideatoapps_add_version( $app, '1.0.0', 'x', $att ) );
		$path = get_attached_file( $att );
		$this->assertSame( $dir, dirname( $path ), 'renamed in place, same unguessable folder' );
		$this->assertStringEndsWith( '/ClipForge-1.0.0.zip', $path );
		$this->assertFileExists( $path );
		$product = wc_get_product( (int) get_post_meta( $app, 'woo_product_id', true ) );
		$this->assertTrue( $product->has_file( ideatoapps_download_id( $app, '1.0.0' ) ), 'the product links the file' );
		$this->assertNotSame( '', ideatoapps_valid_zip_attachment( $att ) );
	}

	public function test_an_already_named_protected_file_is_not_renamed_again(): void {
		$app = $this->app();
		$att = $this->zip_attachment( 'first.zip' );
		ideatoapps_add_version( $app, '1.0.0', 'x', $att );
		$named = get_attached_file( $att );
		wp_update_post( array( 'ID' => $app, 'post_title' => 'Renamed App' ) );
		ideatoapps_update_version( $app, '1.0.0', 'y', $att );
		$this->assertSame( $named, get_attached_file( $att ), 'buyers keep the file name they were sold' );
	}

	public function test_an_upload_that_already_has_the_buyer_name_clears_the_flag_so_a_later_title_change_never_renames_it(): void {
		$app = $this->app();
		$att = $this->zip_attachment( 'ClipForge-1.0.0.zip' );
		$this->assertSame( '1', (string) get_post_meta( $att, '_ideatoapps_unnamed', true ), 'precondition: flagged at upload' );
		$named = get_attached_file( $att );
		$this->assertTrue( ideatoapps_add_version( $app, '1.0.0', 'x', $att ) );
		$this->assertSame( $named, get_attached_file( $att ) );
		$this->assertSame( '', (string) get_post_meta( $att, '_ideatoapps_unnamed', true ), 'flag cleared because the name already matched' );
		wp_update_post( array( 'ID' => $app, 'post_title' => 'Totally Different' ) );
		ideatoapps_update_version( $app, '1.0.0', 'y', $att );
		$this->assertSame( $named, get_attached_file( $att ), 'sold file name is stable' );
		$this->assertFileExists( $named );
	}

	public function test_the_unnamed_flag_survives_a_failed_rename_and_the_next_save_retries(): void {
		$app    = $this->app();
		$att    = $this->zip_attachment( 'upload (7).zip' );
		$dir    = dirname( get_attached_file( $att ) );
		$block  = $dir . '/ClipForge-1.0.0.zip';
		file_put_contents( $block, 'in the way' );
		$orig = get_attached_file( $att );
		ideatoapps_add_version( $app, '1.0.0', 'x', $att );
		$this->assertSame( $orig, get_attached_file( $att ), 'rename refused, file untouched' );
		$this->assertSame( '1', (string) get_post_meta( $att, '_ideatoapps_unnamed', true ), 'flag kept so it can retry' );
		unlink( $block );
		ideatoapps_update_version( $app, '1.0.0', 'y', $att );
		$this->assertSame( $block, get_attached_file( $att ), 'renamed on the retry' );
		$this->assertSame( '', (string) get_post_meta( $att, '_ideatoapps_unnamed', true ), 'flag cleared after the successful rename' );
	}

	public function test_updating_a_version_with_a_new_file_protects_it_without_a_product(): void {
		$app = $this->unlinked_app();
		ideatoapps_add_version( $app, '1.0.0', 'x', $this->zip_attachment( 'a.zip' ) );
		$second = $this->zip_attachment( 'b.zip' );
		ideatoapps_update_version( $app, '1.0.0', 'y', $second );
		$this->assertStringStartsWith( $this->protected_root(), get_attached_file( $second ) );
	}

	public function test_invalid_attachment_on_an_unlinked_app_is_left_alone(): void {
		$app = $this->unlinked_app();
		$txt = wp_insert_attachment( array( 'post_mime_type' => 'text/plain', 'post_title' => 't', 'post_status' => 'inherit' ), wp_upload_bits( 'n.txt', null, 'hi' )['file'] );
		$status = get_post_status( $txt );
		ideatoapps_add_version( $app, '1.0.0', 'x', (int) $txt );
		$this->assertStringNotContainsString( 'woocommerce_uploads', (string) get_attached_file( $txt ) );
		$this->assertSame( $status, get_post_status( $txt ) );
	}

	public function test_stripe_with_a_missing_testmode_setting_counts_as_live(): void {
		update_option( 'woocommerce_stripe_settings', array( 'enabled' => 'yes' ) );
		$this->assertTrue( ideatoapps_stripe_is_live() );
		$this->assertSame( array( 'cod' ), array_keys( ideatoapps_block_live_stripe( array( 'stripe' => new stdClass(), 'cod' => new stdClass() ) ) ) );
		update_option( 'woocommerce_stripe_settings', array( 'enabled' => 'yes', 'testmode' => 'yes' ) );
		$this->assertFalse( ideatoapps_stripe_is_live() );
		update_option( 'woocommerce_stripe_settings', array( 'enabled' => 'no' ) );
		$this->assertFalse( ideatoapps_stripe_is_live(), 'disabled Stripe is never live' );
	}

	public function test_only_a_zip_mime_attachment_is_accepted(): void {
		$up  = wp_upload_bits( 'fake.zip', null, "PK\x05\x06\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0" );
		$bad = (int) wp_insert_attachment( array( 'post_mime_type' => 'image/png', 'post_title' => 'f', 'post_status' => 'inherit' ), $up['file'] );
		$this->assertSame( '', ideatoapps_valid_zip_attachment( $bad ), 'a .zip with the wrong mime is refused' );
		$this->assertNotSame( '', ideatoapps_valid_zip_attachment( $this->zip_attachment( 'ok.zip' ) ) );
	}

	public function test_non_admin_may_only_attach_their_own_uploads_or_keep_the_current_file(): void {
		$app    = $this->unlinked_app();
		$editor = self::make_user( 'editor' );
		$other  = self::make_user( 'editor' );
		$mine   = $this->zip_attachment( 'mine.zip' );
		$theirs = $this->zip_attachment( 'theirs.zip' );
		wp_update_post( array( 'ID' => $mine, 'post_author' => $editor ) );
		wp_update_post( array( 'ID' => $theirs, 'post_author' => $other ) );

		wp_set_current_user( $editor );
		$this->assertTrue( ideatoapps_can_use_version_attachment( $mine, 0 ) );
		$this->assertFalse( ideatoapps_can_use_version_attachment( $theirs, 0 ), 'someone else\'s upload' );
		$this->assertTrue( ideatoapps_can_use_version_attachment( $theirs, $theirs ), 'unchanged value is kept' );
		$this->assertTrue( ideatoapps_can_use_version_attachment( 0, $theirs ), 'clearing is allowed' );

		wp_set_current_user( self::make_user( 'administrator' ) );
		$this->assertTrue( ideatoapps_can_use_version_attachment( $theirs, 0 ), 'admins may use any zip' );
		$this->assertTrue( $app > 0 );
	}

	public function test_metabox_save_ignores_a_foreign_attachment_from_a_non_admin(): void {
		$app    = $this->unlinked_app();
		$editor = self::make_user( 'editor' );
		$theirs = $this->zip_attachment( 'theirs.zip' );
		wp_update_post( array( 'ID' => $theirs, 'post_author' => self::make_user( 'administrator' ) ) );
		wp_set_current_user( $editor );
		$_POST = array( 'ideatoapps_versions_nonce' => wp_create_nonce( 'ideatoapps_save_versions' ), 'ita_new_version' => '1.0.0', 'ita_new_changelog' => 'x', 'ita_new_attachment' => (string) $theirs );
		ideatoapps_save_versions( $app );
		$_POST = array();
		$this->assertSame( 0, ideatoapps_get_versions( $app )[0]['attachment_id'], 'the foreign attachment was not attached' );
	}
}
