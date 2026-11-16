<?php
/**
 * Voice, quiz-variety and spelling rules for starter articles (see blog-lint.php). Each rule takes a string (or a list) and returns problems.
 */

/** The [ita_q] questions of a body as array{answers: string[], correct: int}. */
function ita_lint_quiz_questions( string $body ): array {
	$out = array();
	foreach ( ita_lint_tags( $body, 'ita_q' ) as $q ) {
		$out[] = array( 'answers' => array_map( 'trim', explode( '|', (string) ( $q['answers'] ?? '' ) ) ), 'correct' => (int) ( $q['correct'] ?? 0 ) );
	}
	return $out;
}

/** Per article: the correct answers are not all in the same position, and the correct answer is not the longest option every time. */
function ita_lint_quiz_variety( string $body ): array {
	$qs = ita_lint_quiz_questions( $body );
	if ( count( $qs ) < 2 ) {
		return array();
	}
	$out = 1 === count( array_unique( array_column( $qs, 'correct' ) ) ) ? array( 'Every quiz answer is in the same position.' ) : array();
	$longest = 0;
	foreach ( $qs as $q ) {
		$right = (string) ( $q['answers'][ $q['correct'] - 1 ] ?? '' );
		$lens  = array_map( 'mb_strlen', $q['answers'] );
		$longest += ( '' !== $right && mb_strlen( $right ) >= max( $lens ) ) ? 1 : 0;
	}
	if ( $longest === count( $qs ) ) {
		$out[] = 'The correct answer is the longest option in every question.';
	}
	return $out;
}

/** Across articles: with 6+ questions, no answer position may hold more than half of them. */
function ita_lint_quiz_distribution( array $positions ): array {
	$n = count( $positions );
	if ( $n < 6 ) {
		return array();
	}
	$out = array();
	foreach ( array_count_values( $positions ) as $pos => $count ) {
		if ( $count * 2 > $n ) {
			$out[] = "Answer position {$pos} is correct in {$count} of {$n} questions (more than half).";
		}
	}
	return $out;
}

/** Voice: at most 2 sentences starting with "That's" and at most 2 ", not ..." contrasts per article (visible text). */
function ita_lint_voice( string $body ): array {
	$text  = ita_lint_visible_text( $body );
	$out   = array();
	$thats = (int) preg_match_all( "/(?:\\A|[.!?:;][\"\u{201D}\u{2019})]?\\s+)That['\u{2019}]s\\b/u", $text );
	if ( $thats > 2 ) {
		$out[] = "{$thats} sentences start with \"That's\" (at most 2).";
	}
	$nots = (int) preg_match_all( '/, not (?:(?:a|an|the|your|my) )?/i', $text );
	if ( $nots > 2 ) {
		$out[] = "{$nots} \", not ...\" contrasts (at most 2).";
	}
	return $out;
}

/** American spelling for the whole series. */
function ita_lint_spelling( string $text ): array {
	$words = array(
		'summaris(?:e|es|ed|ing|ation)', 'colours?', 'flats?', 'revis(?:e|es|ed|ing)', 'organis(?:e|es|ed|ing|ation)', 'behaviours?', 'favourites?',
		'recognis(?:e|es|ed|ing)', 'realis(?:e|es|ed|ing)', 'analys(?:e|es|ed|ing)', 'centres?', 'programmes?', 'labelled', 'labelling', 'travelling', 'cancelled',
		'modelling', 'judgement', 'neighbours?', 'grey', 'whilst', 'learnt', 'maths', 'licence', 'catalogues?', 'practis(?:e|es|ed|ing)', 'defence',
		'apologis(?:e|es|ed|ing)', 'emphasis(?:e|es|ed|ing)', 'prioritis(?:e|es|ed|ing)', 'optimis(?:e|es|ed|ing|ation)', 'minimis(?:e|es|ed|ing)',
		'customis(?:e|es|ed|ing)', 'categoris(?:e|es|ed|ing)', 'memoris(?:e|es|ed|ing)', 'visualis(?:e|es|ed|ing)', 'utilis(?:e|es|ed|ing)',
		'honours?', 'humour', 'labours?', 'favours?', 'rumours?',
	);
	return ita_lint_patterns( $text, array_map( static fn( string $w ): string => '/\b' . $w . '\b/i', $words ), 'British spelling' );
}

/** If the article uses the word "prompt", its first use is a glossary term ([ita_term define="..."]prompt...). */
function ita_lint_prompt_term( string $body ): array {
	if ( ! preg_match( '/(?<![\w-])prompts?\b/i', $body, $m, PREG_OFFSET_CAPTURE ) ) {
		return array();
	}
	$before = substr( $body, 0, $m[0][1] );
	return 1 === preg_match( '/\[ita_term define="[^"\]]*"\]\z/', $before ) ? array() : array( 'The first use of "prompt" must be an [ita_term] with a definition.' );
}
