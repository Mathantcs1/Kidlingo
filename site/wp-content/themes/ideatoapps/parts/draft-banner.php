<?php
/**
 * Banner shown at the top of every legal page.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<div class="draft-banner" role="note" data-testid="draft-banner">
	<p class="draft-banner__title"><?php esc_html_e( 'DRAFT, pending legal review', 'ideatoapps' ); ?></p>
	<p class="draft-banner__text"><?php esc_html_e( 'This page is a working draft. It is not legal advice and it will change. Parts marked "Owner to confirm" still have to be filled in.', 'ideatoapps' ); ?></p>
</div>
