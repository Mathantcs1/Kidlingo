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

## 11 Prompting with examples (intermediate)
- Lessons (owns few-shot): labeled input/output pairs; same labels, real examples, empty output label at the end; 2-3 varied examples; examples get copied (endings, topics, typos); examples can outweigh instructions (Why: model can't tell coincidence from pattern).
- Quiz stems: example captions all end with a question; why end with an empty output label; which example set teaches a format best.
- Prompt patterns: Note/Line pairs ending with a blank "Line:".
- Example domains: plumber job notes to invoice lines; creator captions; hiking trip.

## 12 Asking for tables, checklists and JSON (intermediate)
- Lessons: name columns and order; "missing" instead of guessing; CSV pastes better; checklist lines start with a verb, one action per line; JSON via an example object, null for unknowns; code must check JSON (Why: extra text, renamed key, stops halfway).
- Quiz stems: table to paste into an existing sheet; what a cell shows when a value is missing; why a program checks chatbot JSON.
- Prompt patterns: fixed columns plus a "missing" marker; JSON-only reply with an example object.
- Example domains: hardware store stock count; food truck closing checklist; print shop order message. Format table (HTML table).

## 13 System prompts and structured output for builders (advanced)
- Lessons (owns system prompt, prompt injection basics for builders): scope/facts/rules/output order; app injects data (FREE_SLOTS); fallback branch in the output contract; structured modes vary by provider; validate values; retry once then safe reply; small schemas, enums; field order may matter; no secrets; test set after each edit; roles and token markers (Why).
- Quiz stems: user says ignore your rules, where the guard lives; JSON mode still needs validation; what never goes in a system prompt.
- Prompt patterns: markdown-sectioned system prompt with an output contract and explicit "cannot help" branch.
- Example domains: pet-grooming booking assistant; five-message test sheet.

## 14 Reusable prompt templates (intermediate, gated)
- Lessons: fixed rules above a divider, labeled slots below; second real case before saving; remove names; name and date versions; saved sample case to retest after app changes; divider helps separate material from instructions, not reliably (Why).
- Quiz stems: which part is a slot; why test on a second case; what to check before sharing.
- Prompt patterns: "--- Fill in below this line ---" template. Checklist "prompt-template-ready".
- Example domains: teacher rubric feedback; care shift handover, landscaper quote, tutor progress summary.

## 15 Role prompts: when they help (intermediate)
- Lessons: role changes tone, vocabulary, detail, focus, not knowledge; naming the audience often does the same; reader role, practice partner, specific critic; expert role can sound more certain; "act as my doctor/lawyer" gives style only; accuracy effect debated (Why).
- Quiz stems: what a role changes most reliably; confident expert-historian date; best role for feedback on a script opening.
- Prompt patterns: "Read it as your audience" (mark where the reader loses interest, list their remaining questions, no rewrite).
- Example domains: photosynthesis explanation; essay introduction; video script opening; debate and podcast practice.

## 16 Breaking big tasks into steps (beginner)
- Lessons: ask for steps only, edit the list, one step at a time, short checkable answers, repeat a "Decided so far" list; when not to split; length limits and no chance to steer (Why).
- Quiz stems: why steps before work; what goes at the top of the next message; which task needs no splitting.
- Prompt patterns: "Steps only, don't do any yet"; "Decided so far" + step number.
- Example domains: first craft fair candle stall; school research presentation.

## 17 Fixing a bad answer (beginner)
- Lessons: five problem kinds (generic, shape, misunderstood, tone, fact) and fixes; Keep/Change/Add; when to open a new chat; edit-and-resend in some apps; why "try again" repeats mistakes (Why). Refers to 06 for same-chat fixes.
- Quiz stems: correct but too-long study notes; a date you think is wrong; the same mistake after two corrections.
- Prompt patterns: Keep / Change / Add reply.
- Example domains: history chapter study notes.

## 18 Prompting for images and video (intermediate)
- Lessons: six parts (subject, setting, framing, light, style, color/mood); describe what is there instead of "no X"; one action per short clip; plain camera words; change one part at a time; garbled text, wrong details, character consistency, no real faces or living artists' names; attribute mixing and long-prompt weighting (Why).
- Quiz stems: only the light is wrong; misspelled title in the image; why one action per clip.
- Prompt patterns: one-sentence fill-in image description; Start/Action/End/Camera clip beats.
- Example domains: lentil soup thumbnail; honey on pancakes clip; own photo as target.

## 19 Tokens explained (beginner)
- Lessons (owns tokenizer): tokenizer splits, numbers; letters hidden in chunks (figure token-splitting, new angle); output token limits stop answers; other languages take more tokens; long numbers split unevenly; builders: input/output tokens, usage reporting, tokenizers differ, formatting costs tokens; why chunks (Why).
- Quiz stems: why letters get miscounted; answer stops mid-sentence; token count differs between models.
- Prompt patterns: spell it out letter by letter, number, then count.
- Example domains: bookkeeper, Mississippi; a long number; sentence and its translation in a token counter.

## 20 Context windows (intermediate)
- Lessons (deeper than 10): what fills the window (instructions, memory, files, tool results, replies, room for the reply); fitting is not reading well (middle-of-input risk, debated); point to a section and quote; builders: reserve reply room, trim history, fetch instead of stuff, shrink tool results; what summaries lose (Why).
- Quiz stems: what else takes up the window; handbook rule in the middle missed; why leave room in the request.
- Prompt patterns: "Point it to the right part" (one section, quote first); rolling state note with fixed headings.
- Example domains: staff handbook, supplier terms; builder chat history.
