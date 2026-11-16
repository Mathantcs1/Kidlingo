<?php
/**
 * [ita_quiz] with nested [ita_q q="" answers="a|b|c" correct="2" why=""]. Static markup: the question, its answers as a list,
 * and the correct answer inside <details>. blog.js turns valid questions (those with data-correct) into radio buttons.
 * `correct` is the 1-based position of the right answer, counted over the answers as written. An empty segment ("a||c", "a|b|")
 * makes the question unscored (positions would be ambiguous): the non-empty answers are listed, nothing is revealed or scored.
 * A question without a valid `correct` is shown but not scored.
 *
 * @package ideatoapps-core
 */

defined( 'ABSPATH' ) || exit;

/**
 * One question as an <li>, or '' when it has neither text nor answers.
 *
 * @param mixed $atts Attributes.
 * @return string
 */
function ideatoapps_blog_question( $atts ): string {
	$atts    = ideatoapps_blog_atts( $atts, array( 'q' => '', 'answers' => '', 'correct' => '', 'why' => '' ), 'ita_q' );
	$text    = ideatoapps_blog_clean( $atts['q'], 300 );
	$answers = array();
	$gap     = false;
	foreach ( '' === trim( (string) ( is_scalar( $atts['answers'] ) ? $atts['answers'] : '' ) ) ? array() : explode( '|', (string) $atts['answers'] ) as $answer ) {
		$answer = ideatoapps_blog_clean( $answer, 200 );
		if ( '' === $answer ) {
			$gap = true;
		} else {
			$answers[] = $answer;
		}
	}
	$answers = array_slice( $answers, 0, 6 );
	if ( '' === $text ) {
		return '';
	}
	$correct = is_scalar( $atts['correct'] ) && preg_match( '/^\d{1,2}$/', trim( (string) $atts['correct'] ) ) ? (int) $atts['correct'] : 0;
	$valid   = ! $gap && count( $answers ) >= 2 && $correct >= 1 && $correct <= count( $answers );
	$html    = '<li class="ita-q"' . ( $valid ? ' data-correct="' . (int) $correct . '"' : '' ) . '>'
		. '<p class="ita-q__text">' . esc_html( $text ) . '</p>';
	if ( $answers ) {
		$html .= '<ol class="ita-q__options" type="A">';
		foreach ( $answers as $answer ) {
			$html .= '<li>' . esc_html( $answer ) . '</li>';
		}
		$html .= '</ol>';
	}
	if ( $valid ) {
		$why   = ideatoapps_blog_clean( $atts['why'], 400 );
		$html .= '<details class="ita-q__reveal"><summary>' . esc_html__( 'Show answer', 'ideatoapps-core' ) . '</summary>'
			. '<p class="ita-q__answer"><strong>' . esc_html( chr( 64 + $correct ) . '. ' . $answers[ $correct - 1 ] ) . '</strong></p>'
			. ( '' !== $why ? '<p class="ita-q__why">' . esc_html( $why ) . '</p>' : '' ) . '</details>';
	}
	return $html . '</li>';
}

/**
 * [ita_q] used on its own: still readable.
 *
 * @param mixed $atts Attributes.
 * @return string
 */
function ideatoapps_blog_question_alone( $atts ): string {
	$item = ideatoapps_blog_question( $atts );
	return '' === $item ? '' : '<ol class="ita-quiz__list">' . $item . '</ol>';
}

/**
 * [ita_quiz]: collects its [ita_q] children; with none, the body is shown as plain text.
 *
 * @param mixed  $atts    Attributes (unused).
 * @param string $content Body.
 * @return string
 */
function ideatoapps_blog_quiz( $atts, $content = '' ): string {
	$content = is_string( $content ) ? $content : '';
	$items   = '';
	if ( preg_match_all( '/' . get_shortcode_regex( array( 'ita_q' ) ) . '/', $content, $found, PREG_SET_ORDER ) ) {
		foreach ( $found as $match ) {
			$items .= ideatoapps_blog_question( shortcode_parse_atts( $match[3] ) );
		}
	}
	if ( '' === $items ) {
		$loose = ideatoapps_blog_clean( preg_replace( '/' . get_shortcode_regex( array( 'ita_q' ) ) . '/', '', $content ), 600 );
		return '' === $loose ? '' : '<p class="ita-quiz__loose">' . esc_html( $loose ) . '</p>';
	}
	return '<div class="ita-quiz" data-testid="ita-quiz" data-ita-quiz id="' . esc_attr( ideatoapps_blog_uid( 'ita-quiz' ) ) . '">'
		. '<p class="ita-quiz__title">' . esc_html__( 'Quick quiz', 'ideatoapps-core' ) . '</p>'
		. '<ol class="ita-quiz__list">' . $items . '</ol></div>';
}

add_shortcode( 'ita_quiz', 'ideatoapps_blog_quiz' );
add_shortcode( 'ita_q', 'ideatoapps_blog_question_alone' );
