<?php
/**
 * Settings > IdeaToApps: the "Sender for site emails" rows.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * Print the table rows for the sender address and name (inside the settings form table).
 */
function ideatoapps_render_mail_sender_rows() {
	?>
				<tr>
					<th scope="row"><label for="ita-mail-from-email"><?php esc_html_e( 'Sender for site emails', 'ideatoapps-core' ); ?></label></th>
					<td>
						<input type="email" id="ita-mail-from-email" name="mail_from_email" class="regular-text" autocomplete="off" value="<?php echo esc_attr( (string) get_option( 'ideatoapps_mail_from_email', '' ) ); ?>" placeholder="admin@yourdomain.com">
						<p class="description"><?php esc_html_e( 'Sender address', 'ideatoapps-core' ); ?></p>
						<input type="text" id="ita-mail-from-name" name="mail_from_name" class="regular-text" maxlength="80" autocomplete="off" value="<?php echo esc_attr( (string) get_option( 'ideatoapps_mail_from_name', '' ) ); ?>" placeholder="IdeaToApps">
						<p class="description"><?php esc_html_e( 'Sender name (optional, up to 80 characters, no commas)', 'ideatoapps-core' ); ?></p>
						<p class="description"><?php esc_html_e( 'Applies to this plugin\'s own emails only: the newsletter confirmation, the reading link and the contact form notification. It does not change WooCommerce or other plugins\' mail. The address must be a real mailbox on this site\'s domain, so replies and bounces reach someone. It is never shown on the site. Leave both empty to use the WordPress default (wordpress@ your domain). After setting it, check Email Deliverability (SPF and DKIM) in cPanel.', 'ideatoapps-core' ); ?></p>
					</td>
				</tr>
	<?php
}
