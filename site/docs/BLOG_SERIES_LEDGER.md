# Blog series ledger

What each article already teaches, so later articles refer back instead of repeating. Read it before drafting; append your
articles when done. Keep entries compact. "Owns" = the article that teaches a core lesson; others refer to it in plain words.

Core lessons and their owner:
- Chatbots predict the next piece of text (token), with some randomness: 01 (figure chatbot-answer-flow).
- Training cutoff (named "cutoff date" in 01, "training cutoff" from 04 on); search/files add newer text: 01, detail in 04.
- Ask it to flag what to double-check: 01 (prompt pattern used once; do not reuse).
- Typical-choice gaps (vague prompt gives a generic answer): 09.
- Same-chat follow-ups beat starting over: 06 (Myth 2). 08 refers back in words.
- Context window (oldest messages dropped or summarized, depending on the app): 10 (figure context-window); 05 defines it.
- "Ask me questions first": 10.
- Privacy rule everywhere: never paste passwords or ID numbers; remove names and case numbers before pasting documents.

## 01 What AI is and isn't (beginner)
- Lessons: AI as umbrella term; ML learns from examples; chatbots predict tokens; not a person / search engine / neutral; hallucination; bias.
- Quiz stems: how a chatbot produces its answer; confident quote from a named expert; why no news from last week without search.
- Prompt patterns: explain an idea simply, then list two things to double-check.
- Example domains: spam filter, phone keyboard, map travel time, photo grouping.

## 09 The four-part prompt recipe (beginner)
- Lessons: Task, Context, Format, Limits; one task at a time; length limits are rough; typical-choice gaps.
- Quiz stems: which part sets the answer's shape; why a vague prompt gives a generic answer; asked for 100 words, got 120.
- Prompt patterns: weak vs better version with labeled Task/Context/Format/Limits lines.
- Example domains: email to a landlord about a broken heater; neighbor message; grocery list; study plan.

## 27 What is an AI agent (intermediate)
- Lessons: agent = model + tools + loop; chatbot vs agent; tool calling (program runs the tool); errors compound, misread goals, hidden instructions, loops; human approval.
- Quiz stems: chatbot vs agent difference; who runs the tool; which action needs human approval.
- Prompt patterns: none (checklist "agent-before-acting").
- Example domains: finding a meeting hour across calendars; tidying a downloads folder.

## 02 ML vs deep learning vs generative AI (intermediate)
- Lessons: nested boxes; deep learning = many-layer neural networks, more data and computing; generative output; pick the method from the job; interpretability (Why).
- Quiz stems: how the three terms relate; forecasting sales from a spreadsheet; typical generative failure.
- Prompt patterns: choose a method for a data task (CSV of labeled support tickets, compare three options, recommend one).
- Example domains: library loans; support tickets; face-finding photo app; shop sales forecast; paper sort of everyday AI.

## 03 AI and accessibility: tools that help (beginner)
- Lessons: captions/transcripts, screen readers (mostly fixed rules; AI in extras), text-to-speech, image descriptions, simplified reading, dictation; accessible design comes first; why captions miss some voices (Why).
- Quiz stems: captions get a colleague's name wrong; where AI shows up in a screen reader setup; checking a chatbot's short version of a letter.
- Prompt patterns: simplify a text while keeping named facts exactly, then list what was left out. Checklist "accessibility-feature-check".
- Example domains: video calls, class slides, parent newsletter, photographed letters, medicine dose.

## 04 How a chatbot "knows" things (beginner)
- Lessons: training stages; training cutoff; knowledge as patterns in parameters; frequent vs rare facts; occasional verbatim text (Why); search/files/memory add new text; tone is not evidence.
- Quiz stems: which training stage teaches instruction-following; which fact is most likely wrong; what to do with cited search results.
- Prompt patterns: answer, then label each fact by source (search in this chat, shared file, training only).
- Example domains: capital cities, small shop hours, history date for homework, local park or library.

## 05 A plain-English AI glossary (beginner)
- Lessons: short definitions (training cutoff, parameters, open-weight and licenses, token, context window, memory, temperature, multimodal, hallucination, bias, guardrails, tool, agent).
- Quiz stems: what a token is; which term explains losing track in a long chat; what fine-tuning means.
- Prompt patterns: explain a term in two sentences, give an example, name a common misunderstanding.
- Example domains: app settings, help pages; fill-in definition card.

## 06 AI myths that waste your time (beginner)
- Lessons (owns same-chat follow-ups): no magic phrases; fix drafts in the same chat; padding hurts; "are you sure?" is weak (sycophancy, Why); randomness; privacy; AI-detector limits.
- Quiz stems: shift-schedule notice too long; why "are you sure?" is weak; AI-detector flags a colleague's report.
- Prompt patterns: none (checklist "ai-myths-team-habits"); Try it cuts a long request to the details that change the answer.
- Example domains: online shop product descriptions; cafe, cleaning crew, repair shop; customer quote.

## 07 Using AI when English isn't your first language (beginner)
- Lessons: write in your own language or mixed; less common languages; explained corrections (explanations can be wrong); keep your voice; main points of long text; important documents need a qualified person or certified translator; rehearsal.
- Quiz stems: learning from corrections; official letter about your lease; rewrite sounds stiff.
- Prompt patterns: correct and explain each change; role-play rehearsal with one tip per turn.
- Example domains: email to a coworker, note to a child's teacher, government form, doctor's office call, delivery call.

## 08 Your first week with AI (beginner, gated)
- Lessons: one app for a week; settings check; ground rules; writing before facts; catching a mistake on a known topic; weekly review.
- Quiz stems: why one app all week; why tidy your own notes; why ask about a topic you know well.
- Prompt patterns: short message with "Must include" and length lines (soccer team parents).
- Example domains: shift-swap request, sports team reminder, parents' meeting notes, work-van job list, meal plan, garage, trade or hobby.

## 10 Give context, get better answers (beginner)
- Lessons (owns "ask me first" and context window): kinds of context; a short sample of your own style; interview prompt; repeat key details in long chats.
- Quiz stems: why say what you've tried; what helps match your usual style; what to do when unsure which details matter.
- Prompt patterns: before/after notice with a style sample line (layout echoes 09's weak/better); "ask me first" interview.
- Example domains: bakery closing on Mondays; message to a customer, school or local group.

## Lessons taught twice: refer back (never re-teach)
Checking facts in a trusted source; an example beats a description; change one thing at a time; carry a short summary to a new
chat; save reusable prompts in a note; validate JSON in your code (13); start a new chat vs fix in the same chat (06); context
window basics (10); training cutoff (04); ask-me-questions-first (10); flag-what-to-double-check (01). Refer by title, once per article.

## 11 Prompting with examples (intermediate)
- Opener: short example (job note becomes invoice line); no thesis line.
- Lessons (owns few-shot): labeled input/output pairs; same labels, real examples, empty output label at the end; use only facts in the note; 2-3 varied examples; examples get copied (endings, topics, typos); examples can outweigh instructions.
- Why: "How examples pull the answer toward them". Cross-ref: Give context, get better answers.
- Quiz stems: example captions all end with a question; why end with an empty output label; which example set teaches a format best.
- Prompt patterns: Note/Line pairs ending with a blank "Line:" (example pairs labeled).
- Example domains: plumber job notes to invoice lines (trade owner 1 of 2); creator captions.
- Try it: 4 steps, done with a coworker or friend; ends by adding their answer as a rule.

## 12 Asking for tables, checklists and JSON (intermediate)
- Opener: common mistake + one-line thesis (thesis 1 of 3 in batch B).
- Lessons: name columns and order; "missing" instead of guessing, then spot-check rows; CSV: save as .csv or split text into columns, quote values with commas; checklist lines start with a verb, one action per line; JSON via a labeled example object, values taken from the message, null for unknowns; remove customer names before pasting.
- Why: "Where JSON from a chatbot breaks". Cross-ref: System prompts and structured output for builders. HTML table with caption and scoped headers.
- Quiz stems: table to paste into an existing sheet; why "missing" beats a filled cell; pasted table lands in one column (CSV).
- Prompt patterns: fixed columns plus a "missing" marker; JSON-only reply with a labeled example object.
- Example domains: warehouse team stock count (employee); community center closing checklist for volunteers (community); print order message.
- Try it: 5 steps, on paper (1 of 2); ends "fix that line and run it again".

## 13 System prompts and structured output for builders (advanced)
- Opener: direct answer, no thesis line.
- Lessons (owns system prompt, JSON validation in code, prompt injection for builders): scope/facts/rules/output order; app injects data (FREE_SLOTS); real JSON shape with allowed values and a "cannot help" branch; structured modes vary; validate values; cut-off replies even in structured modes; retry once then safe reply; small schemas; field order may matter; no secrets; test set after each edit.
- Why: "Where does the system prompt actually go?" (roles, token markers, trained weight).
- Quiz stems: user says ignore your rules, where the guard lives; JSON-constraining mode still needs validation; what never goes in a system prompt.
- Prompt patterns: Markdown-sectioned system prompt with an output contract and explicit fallback.
- Example domains: pet-grooming booking assistant (shop owner 2 of 2).
- Try it: 5 steps, test sheet for a teammate; ends committing it next to the prompt.

## 14 Reusable prompt templates (intermediate, gated)
- Opener: common mistake; no thesis line.
- Lessons (owns templates): fixed rules above a divider, labeled slots below; school and workplace rules before pasting; second real case before saving; remove names; name and date versions; saved sample case to retest after app changes.
- Why: "What the divider does" (helps, not reliably, against instructions in pasted text).
- Quiz stems: which part is a slot; why test on a second case; what to check before sharing.
- Prompt patterns: "--- Fill in below this line ---" template (teacher feedback; care home shift handover with initials only). Checklist "prompt-template-ready".
- Example domains: teacher rubric feedback; care worker handover (employee).
- Try it: 5 steps, template from a request sent twice; ends "save it" (1 of 2).

## 15 Role prompts: when they help (intermediate)
- Opener: reader's question answered in the hook; no thesis line.
- Lessons: role changes tone, vocabulary, detail, focus, not knowledge; naming the audience often does the same; reader role (answer is a guess about your reader), practice partner, specific critic; expert role can sound more certain; "act as my doctor/lawyer" gives style only.
- Why: "Why would a role change the answer at all?" (accuracy effect debated). Cross-ref: How a chatbot "knows" things.
- Quiz stems: what a role changes most reliably; what an expert-economist role tells you about a figure; which role helps feedback on a script opening.
- Prompt patterns: "Read it as your audience" (mark where the reader loses interest, list their remaining questions, no rewrite).
- Example domains: photosynthesis explanation; university essay introduction; video script opening; debate and podcast practice.
- Try it: 4 steps, ranking readers by risk; ends by fixing the marked sentence.

## 16 Breaking big tasks into steps (beginner)
- Opener: scenario ("Say you're moving your family..."), the batch's only scenario opener; no thesis line.
- Lessons: ask for steps only, edit the list, one step at a time, short checkable answers, "Decided so far" list lets you start a fresh chat; when not to split.
- Why: "Why does one huge request go wrong?" Cross-ref: Give context, get better answers.
- Quiz stems: why steps before work; what goes at the top of the next message; which task needs no splitting.
- Prompt patterns: "Steps only, don't do any yet"; "Decided so far" + step number.
- Example domains: family move (parent/family logistics); university essay.
- Try it: 5 steps, on paper (2 of 2); ends sending the second prompt.

## 17 Fixing a bad answer (beginner)
- Opener: common mistake + one-line thesis (thesis 2 of 3).
- Lessons: five problem kinds (generic, shape, misunderstood, tone, fact) and fixes; Keep/Change/Add; don't skip Keep; when to open a new chat; edit-and-resend in some apps.
- Why: "Why does 'try again' often bring back the same mistake?" Cross-ref: AI myths that waste your time.
- Quiz stems: correct but too-long study notes; misread first message, edit and resend; same mistake after two corrections.
- Prompt patterns: Keep / Change / Add reply.
- Example domains: university biology study notes; lecture notes.
- Try it: 3-step quick version; ends checking changed parts and skimming the rest.

## 18 Prompting for images and video (intermediate)
- Opener: short example (two descriptions) + one-line thesis (thesis 3 of 3).
- Lessons: six parts (subject, setting, framing, light, style, color/mood); shape in the app's settings; describe what is there instead of "no X"; one action per short clip; plain camera words first; text can be garbled; wrong details; character consistency; no real faces or living artists' names.
- Why: "How image generators read a long description" (first part read; color/object mix-ups).
- Quiz stems: only the light is wrong; misspelled title in the image; why one action per clip.
- Prompt patterns: one-sentence fill-in image description; Start/Action/End/Camera clip beats.
- Example domains: lentil soup thumbnail; honey on pancakes clip; own photo as target.
- Try it: 4 steps, own photo as target; ends "save the new sentence" (2 of 2).

## 19 Tokens explained (beginner)
- Opener: reader's question answered in the hook; no thesis line.
- Lessons (owns tokenizer): tokenizer splits and numbers; letters inside chunks are never separate (figure token-splitting, example split; spaces often join the next word's token); spell-it-out prompt; output token limits; other languages take more tokens; long numbers split unevenly; builders: input/output tokens, usage reporting, tokenizers differ, formatting costs tokens.
- Why: "Why not use single letters, or whole words?"
- Quiz stems: why letters get miscounted; answer stops mid-sentence; token count differs between models.
- Prompt patterns: spell it out letter by letter, number, then count.
- Example domains: bookkeeper, Mississippi; a long number; sentence and its translation in a token counter.
- Try it: fill-in card (no numbered steps); ends "choose a long word and write it on the card".

## 20 Context windows (intermediate)
- Opener: common mistake; no thesis line.
- Lessons (deeper than 10): what fills the window (instructions, memory, files, tool results, earlier replies unless dropped or summarized, room for the reply); fitting is not reading well (middle-of-input risk, debated); point to a section and quote; workplace rules before pasting; builders: reserve reply room, trim history, send only the passages that matter, shrink tool results, longer inputs are slower.
- Why: "What does a summary lose?" Cross-ref: Tokens explained.
- Quiz stems: what else takes up the window; handbook rule in the middle missed; why leave room in the request.
- Prompt patterns: "Point it to the right part" (one section, quote first); rolling state note with fixed headings.
- Example domains: staff handbook, supplier terms; builder chat history.
- Try it: 4 steps, needs no app, done for a coworker; ends handing them the list to mark.
