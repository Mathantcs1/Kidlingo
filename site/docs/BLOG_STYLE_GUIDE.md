# Blog style guide (starter articles)

How to write an article file for the IdeaToApps AI blog. The three reference articles are
`content/articles/01-what-ai-is-and-isnt.html`, `09-the-four-part-prompt-recipe.html` and `27-what-is-an-ai-agent.html`
(in `wp-content/plugins/ideatoapps-core/`). `tests/php/BlogContentLintTest.php` enforces the checkable rules below; a human editor
reviews everything else before a post is published. Every article is an AI-assisted draft until a person signs it off.

## Audience
Curious adults and students who use, or are about to use, AI tools. No technical background assumed. Any technical word gets a
plain definition the first time it appears, with `[ita_term]`. If a ten-word definition is not possible, the word probably does
not belong in the article.

## Voice
- Plain, warm and direct. Talk to the reader as "you". Use contractions (it's, you'll, don't).
- Short sentences, mixed with the odd longer one so the rhythm doesn't go flat. One idea per paragraph; paragraphs of 1-4 sentences.
- Concrete, everyday examples: an email to a landlord, a study plan, a recipe, a calendar. Not abstract "use cases".
- Describe how things generally work. Never claim what a specific product can or cannot do.
- No hype and no fear. If something is uncertain or still debated, say so plainly.

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
<!--ita {"slug":"01-what-ai-is-and-isnt","title":"What AI is and isn't","category":"ai-basics","excerpt":"...","reviewed":"2026-11-16","gated":false,"check":["claim 1","claim 2","claim 3"]} -->
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
- `gated`: `true` or `false` (0/1 also parse). Write `false`. Which posts are subscriber-only is decided later, by the owner.
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

**Prompt box**: the text is copied exactly as written, so write it the way a reader would paste it.
```
[ita_prompt title="A better version"]
Write a short email to my landlord asking for the heater to be repaired.
[/ita_prompt]
```

**Quiz**: exactly 3 `[ita_q]`. `answers` are separated by `|` (no empty answers, no `|` inside one). `correct` is the 1-based
position of the right answer. `why` is required: one sentence explaining the answer.
```
[ita_quiz]
[ita_q q="What does a chatbot do to produce its answer?" answers="Looks it up|Predicts the next piece, again and again|Copies a website" correct="2" why="It builds the answer one predicted piece at a time."]
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
[ita_term define="A small piece of text, often part of a word, that a model reads and writes."]token[/ita_term]
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

## Before you hand a draft over
- Run `php vendor/bin/phpunit --filter BlogContentLintTest` from `site/`.
- Read it aloud once. Cut any sentence you would not say to a friend.
- Every factual sentence should be something a careful reader can check. If you are not sure, soften it or cut it.
