# Blog style guide (starter articles)

How to write an article file for the IdeaToApps AI blog. The three reference articles are
`content/articles/01-what-ai-is-and-isnt.html`, `09-the-four-part-prompt-recipe.html` and `27-what-is-an-ai-agent.html`
(in `wp-content/plugins/ideatoapps-core/`). `tests/php/BlogContentLintTest.php` enforces the checkable rules below; a human editor
reviews everything else before a post is published. Every article is an AI-assisted draft until a person signs it off.

## Audience
Everyone who uses, or is about to use, AI tools: beginners, students, teachers and tutors, parents and families, workers and small
business owners, creators and builders (developers and technical readers). Plain language and accessibility are rules for every
article, not an audience. Any technical word gets a plain definition the first time it appears, with `[ita_term]`. If a ten-word
definition is not possible, the word probably does not belong in the article.

## Levels and audiences
Every topic in `content/topics.json` has a `level` and 1-3 `audiences`; the article header repeats them exactly (the parser rejects
a mismatch). The theme shows a level badge, audience chips and a "Who this is for" line made from them, so never type that line
into the article.
- `level`: `beginner` (no background assumed), `intermediate` (has used AI apps and wants to do more), `advanced` (comfortable
  with technical ideas; code-style examples are fine inside prompt boxes, still no outside links).
- `audiences`: `beginners`, `students`, `teachers-and-tutors`, `parents-and-families`, `workers-and-business-owners`, `creators`,
  `builders`.
- **Readability** (Flesch reading ease of the visible text, `tests/php/helpers/blog-lint-readability.php`): at least 60 for
  beginner, 50 for intermediate, 40 for advanced. When an article falls short, shorten sentences and use plainer words; never lower
  the threshold. Short paragraphs; no idioms that translate badly ("ballpark", "piece of cake").
- Targets for the 50 topics (`tests/php/BlogCoverageLintTest.php` checks them on `topics.json`, so they hold before every article
  exists): beginner >= 22, intermediate >= 14, advanced >= 6; audiences at least beginners 20, students 8, teachers-and-tutors 4,
  parents-and-families 3, workers-and-business-owners 8, creators 4, builders 10; every category has at least one beginner and one
  intermediate topic. Current matrix (the test fails if this copy is out of date):

| Level | Topics | Minimum |
| --- | --- | --- |
| beginner | 22 | 22 |
| intermediate | 21 | 14 |
| advanced | 7 | 6 |

| Audience | Topics | Minimum |
| --- | --- | --- |
| beginners | 21 | 20 |
| students | 18 | 8 |
| teachers-and-tutors | 7 | 4 |
| parents-and-families | 4 | 3 |
| workers-and-business-owners | 22 | 8 |
| creators | 7 | 4 |
| builders | 18 | 10 |

| Category | Beginner | Intermediate | Advanced |
| --- | --- | --- | --- |
| ai-basics | 7 | 1 | 0 |
| prompting | 4 | 5 | 1 |
| llms | 2 | 4 | 2 |
| agents | 2 | 4 | 4 |
| work-and-learning | 4 | 4 | 0 |
| safety-and-judgment | 3 | 3 | 0 |

## Voice
- Plain, warm and direct. Talk to the reader as "you". Use contractions (it's, you'll, don't).
- Short sentences, mixed with the odd longer one so the rhythm doesn't go flat. One idea per paragraph; paragraphs of 1-4 sentences.
- Concrete, everyday examples: an email to a landlord, a study plan, a recipe, a calendar. Not abstract "use cases".
- Describe how things generally work. Never claim what a specific product can or cannot do.
- No hype and no fear. If something is uncertain or still debated, say so plainly.
- **American spelling** for the whole series: summarize, color, behavior, judgment, neighbor, apartment (not flat), studying
  (not revising), grocery shopping. The lint fails on a list of British spellings.
- **Words with fixed meanings**: "prompt" is defined with `[ita_term]` at its first use in every article that uses it. "Tool" always
  means a capability the model calls (search, read a file, add a calendar entry); the chat product people open is an "app".

### Habits that make text sound machine-written (avoid)
- The same skeleton every time. Vary openers, section shapes (lists, h3s, short paragraphs, bold-lead paragraphs) and endings.
  Not every article needs a definitional hook, a one-line punch and a neat closing aphorism.
- More than 2 sentences starting with "That's" per article (the lint counts them).
- "X, not Y" contrasts ("a goal, not a list"): at most 1 per article; the lint fails at 3 or more.
- Rule-of-three lists as the default rhythm, and clipped two-sentence pairs ("Usually they match. Sometimes they don't.").

## Structure
1. **Hook**: 2-3 sentences that give the real answer early. No warm-up paragraph.
2. **3-5 `<h2>` headings in total**, the last one is exactly `Try it`. Use `<h3>` inside a section if needed. Never `<h1>` (the title is the h1).
3. **One `[ita_figure]`** where a diagram makes the idea clearer (maximum 3 per article).
4. **1-3 prompt boxes** (`[ita_prompt]`) or a checklist (`[ita_checklist]`): at least one of the two.
5. **One `[ita_why]`** with deeper detail for readers who want it. The article must still make sense if nobody opens it.
6. **One `[ita_quiz]` with exactly 3 questions**, placed before `Try it`.
7. **`Try it`**: one concrete exercise a reader can do in about 5 minutes, with clear steps.
8. Length: 800-1,100 words of visible text (the lint allows 700-1,300). Prompt, quiz and checklist text count.

## Article file format
One file per article: `content/articles/NN-slug.html`, where `NN-slug` is the `slug` from `content/topics.json`. The file must start
(an optional byte-order mark and whitespace are allowed before it) with one HTML comment holding a JSON header, then the body:

```html
<!--ita {"slug":"01-what-ai-is-and-isnt","title":"What AI is and isn't","category":"ai-basics","excerpt":"...","reviewed":"2026-11-16","gated":false,"level":"beginner","audiences":["beginners","students","parents-and-families"],"check":["claim 1","claim 2","claim 3"]} -->
<p>First paragraph of the body...</p>
```

What the parser (`includes/blog-article-file.php`) requires:
- The comment starts with `<!--ita ` and the JSON object is followed by `-->`. Keep it on one line; never write `}-->` inside a string.
- `slug`: two digits, a hyphen, lowercase words joined by hyphens; must equal the file name without `.html` and exist in `topics.json`.
- `title`: exactly the topic title in `topics.json` (compared after WordPress text sanitising).
- `category`: the topic's category slug in `topics.json` (`ai-basics`, `prompting`, `llms`, `agents`, ...).
- `excerpt`: 1-160 characters of plain text. It is shown on cards and in search results.
- `reviewed`: a real `YYYY-MM-DD` date. **It is the date the draft was written, not a human review date.** The installer stores it
  as `ita_drafted_on`; the human review date is recorded only when an editor signs the post off in the Editorial review box.
- `gated`: `true` or `false` (0/1 also parse). `true` only for the owner-approved slugs 08, 14, 32, 36, 42 and 44; `false` for every other article. It seeds the "Subscribers only" box; the owner can change any post afterwards.
- `level` and `audiences`: exactly the topic's values in `topics.json` (same audiences, same order), from the lists above.
- `check`: an array of 3-6 non-empty strings (see below).
- The body after the comment must not be empty, and the whole file must stay under 400 KB.

## The `check` list
3-6 concrete factual claims from the article that a human must verify before publishing. They appear in the editor's Editorial
review box. Write each one as a claim, so the reviewer can say "true" or "false":
- Good: "Chatbots produce text by repeatedly predicting the next token."
- Bad: "Check the AI section." (not a claim) or "Is this accurate?" (a question).
Pick the claims a careful reader is most likely to question: definitions, how something works, anything that sounds like a fact.

## Shortcodes
Attribute values go in double quotes and must not contain `"`, `[`, `]` or `<`. Write "less than" instead of `<`.

**Prompt box**: the text is copied exactly as written, so write it the way a reader would paste it. Lint rules apply to prompt
text too, so a prompt in the reader's voice still avoids phrases such as "when I" or "I asked". Square brackets mean "the reader
fills this in" and nothing else. **The note is automatic**: a box with a `[bracket]` slot prints "Replace the parts in [brackets]
with your own details." above the text (not copied). Never write "(example values: replace them)" in a title or sentence.
```
[ita_prompt title="A better version"]
Write a short email to my landlord asking for the heater to be repaired.
[/ita_prompt]
```

**Quiz**: exactly 3 `[ita_q]`. `answers` are separated by `|` (no empty answers, no `|` inside one). `correct` is the 1-based
position of the right answer. `why` is required: one sentence explaining the answer. Make the quiz a real check:
- Vary the position of the right answer: never the same position for all 3 questions, and across all articles no position may be
  right in more than half of the questions (the lint checks both).
- Distractors must be plausible, ideally half-true statements a reader could believe. No joke answers.
- The right answer must not be the longest option in every question.
```
[ita_quiz]
[ita_q q="What does a chatbot do to produce its answer?" answers="Retrieves the closest answer it stored in training|Searches the web and summarizes the top page|Predicts the next piece, again and again" correct="3" why="It builds the answer one predicted piece at a time."]
[/ita_quiz]
```

**Checklist**: give it a stable, unique `id` (the reader's ticks are saved under it).
```
[ita_checklist id="agent-before-acting"]
[ita_item]The goal is written down in one sentence.[/ita_item]
[/ita_checklist]
```

**Why box**: deeper detail; may contain `<p>`, lists, `<strong>`, `<em>`, `<code>` and `[ita_term]`.
```
[ita_why title="Why does the same question get different answers?"]<p>...</p>[/ita_why]
```

**Glossary term**: the definition shows on hover, focus or tap. Use it in body text or inside a Why box, never inside an attribute.
```
[ita_term define="The message or instructions you type to an AI app to tell it what you want."]prompt[/ita_term]
```

**Figure**: `name` is a file in `content/figures/` (without `.svg`). `alt` is required, plain text, at most 140 characters, and
says what the diagram shows. `caption` is optional.
```
[ita_figure name="agent-loop" alt="A goal enters a loop of plan, act, observe and check, which repeats until the result is ready." caption="The agent loop."]
```

## Banned, and why
These either break readers' trust, go stale, or put the owner at risk. The lint catches most of them; the reviewer catches the rest.
- **Invented experience**: personal stories or anecdotes presented as real, "in my experience", "I tested", "we tested", "I tried",
  "I've used", "I asked", "our users", "our customers". The articles are AI-drafted; nobody had those experiences.
- **Invented evidence**: quotes, studies, surveys, statistics or numbers presented as data. If a fact needs a number, leave it out.
- **Stale facts**: product names with version numbers (model names such as a family name followed by a number), benchmark scores,
  prices, currency symbols or currency words, plan names such as "free tier". They change monthly and make the post wrong.
- **Superlatives**: "the best", "leading", "state-of-the-art", "cutting-edge", "world-class", "revolutionary". They are unverifiable.
- **Advice we cannot give**: medical, legal or financial advice. Say "check with a qualified professional" where it matters.
- **Email addresses** of any kind, and **links**: no outside links at all in v1 (no `http://`, `https://`, `www.` or `href`).
- **Filler**: "In today's fast-paced world", "delve", "unlock", "game-changer", "revolutionize", "it's important to note", "As an AI".
  They add nothing and sound machine-written.
- Fake authors or credentials. The byline is "IdeaToApps" and says the draft was AI-assisted.

## Rules learned in review
Article 51 and later follow these too. `BlogLintSeriesTest` checks the budgets and cross-references; the rest is for the reviewer.
- **Lesson owners** (others refer back in one short clause, never re-teach): prompt injection 13 and 27; agent loop and limits 27
  and 31; tool definitions 29; context window 10 and 20; training 22; made-up details 23; sources 40; human approval 35; what never
  to paste 45; the five-minute fact-check 47; "a step is done only when the log shows it" 31.
- **Privacy**: outside 45, one short clause ("remove names; only if your workplace allows it"), pointing to 45 when useful.
- **Banned formulas**: roadmap sentences after the hook; closing aphorisms; comments on a prompt box in the next sentence ("Notice
  ..."); one-line bridges into the Why box; "The same ... works/applies/helps" pivots (give a second audience its own short
  paragraph with a real action, or fold it into the main example); "As 'X' explains".
- **Phrase budgets per article**: "such as" 2; "often" + "usually" 4 (hedge each claim once, drop hedges on safe claims, keep
  them on privacy, legal, safety and security claims and in `check`); "differ(s) between" 1; one warmth formula ("If you've
  ever", "You've probably"); one hypothetical lead-in ("Say you", "Imagine", "Picture a", "It's [time]"), and at most 8
  "It's [time]" openers in the whole series. Justified exceptions go in `tests/php/helpers/blog-lint-series-allow.txt`.
- **Cross-references**: at most one per article, the title always in double quotes and never the subject of a stock verb: (see
  "Context windows") or (the article "Context windows" explains why). Vary the sentence around it.
- **Try it**: when it asks a question, exactly one correct answer; give a time only when it is not about five minutes.
- **Quizzes**: no distractor a reader rules out on sight, no "pick the calm answer" pattern, no reused stem concept (check the
  ledger); at least a third of stems concrete ("Which line do you check?", "Where do you look?").
- **Example domains**: vary them across a batch of ten: at most 2 shop or trade owners, at least one employee role, one older adult,
  one learner (high-school, adult or vocational) and one family case; "university student" at most once. Record them in the ledger.
- **Definitions**: every acronym and technical term gets an `[ita_term]` at first use in every article, with the glossary's
  wording (05, and 12 for JSON); one definition per term per article.

## Before you hand a draft over
- Run `php vendor/bin/phpunit --filter 'BlogContentLintTest|BlogLintSeriesTest'` from `site/`.
- Read it aloud once. Cut any sentence you would not say to a friend.
- Every factual sentence should be something a careful reader can check. If you are not sure, soften it or cut it.
