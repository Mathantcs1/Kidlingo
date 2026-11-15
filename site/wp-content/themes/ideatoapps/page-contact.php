<?php
/**
 * Contact: the form once the owner enables it, otherwise a "not yet available" notice. No email address is shown.
 *
 * @package IdeaToApps
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<article class="section page" data-testid="page-contact">
	<div class="container container--narrow">
		<?php ideatoapps_part( 'section-heading', array( 'level' => 1, 'title' => __( 'Contact', 'ideatoapps' ) ) ); ?>
		<?php ideatoapps_part( 'contact-form' ); ?>
	</div>
</article>
<?php
get_footer();
