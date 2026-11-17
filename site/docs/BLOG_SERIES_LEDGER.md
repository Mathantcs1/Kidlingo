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

## 21 Temperature and randomness (intermediate)
- Opener: "If you've ever asked..." (regenerate gives a new title); no thesis. Layout: myth/fact (three h3 beliefs), mostly paragraphs, no bold-lead lists.
- Lessons (owns temperature, top-p, seed): low = steadier, high = more varied; zero is not accuracy; small run-to-run differences (server batching); each provider has its own range/default, some models ignore it; settings by task in prose; judge a setting on several runs; in chat apps, ask for options that differ in named ways. Defines API.
- Why: "What the temperature number changes". Cross-ref: What AI is and isn't ("shows how").
- Quiz stems: lowest temperature for a fact question; varied captions with no temperature setting; extraction gives different order numbers, which change fits.
- Prompt patterns: "Different on purpose" (N captions, each differing in a named way, two-word label); example label in the sentence before the box; nothing after the box.
- Example domains: retired woodworker's workshop captions (older adult, creator); delivery-note dates and order numbers (builder).
- Try it: 4 steps; same request three times, mark what changed; ends lowering the temperature, comparing numbers with the original, three more runs.

## 22 How LLMs are trained (intermediate)
- Opener: direct answer; no thesis (cut in review). Layout: walkthrough with h3 parts.
- Lessons (owns training): collection and filtering; next-token loop, parameters changed after batches; base model continues text (boil-an-egg forum example); example conversations; preferences and safety; practice on checkable tasks (math, code with tests); chats don't change parameters; chats may train later models (settings); fine-tune for format/tone vs send changing facts. No figure (training-stages stays with 04).
- Why: "How people's choices become training". Cross-ref: none by title.
- Quiz stems: what a pretrained-only model does with a question; what each training step changes; what people provide in preference training. Key 1-3-3.
- Prompt patterns: "Quiz me on one phase" (explain in five sentences, three questions one at a time with feedback); label before the box; nothing after.
- Example domains: high-school student self-test.
- Try it: 4 steps, with a classmate or family member, no app, four boxes; ends asking which box gave most general knowledge (answer: pretraining), checked against the first section.

## 23 Hallucinations and how to catch them (beginner)
- Opener: short statement ("A reading list from a chatbot can look complete..."); no thesis.
- Lessons (owns spotting made-up details): likely text on rare topics; scoring that rewarded answering (hedged, researchers); search doesn't remove it; checklist "made-up-detail-signs"; false-premise questions; exact-count requests; open questions; checking sheet in a new chat.
- Why: "What makes a fake reference look real" (now after the checklist, before the box). Cross-ref: none by title.
- Quiz stems: why five sources may be made up; false premise about a community choir prize; claims to have read a link the app can't open.
- Prompt patterns: "Make a checking sheet"; the new-chat instruction comes before the box; nothing after.
- Example domains: reading list and references; grandmother's community choir (older adult, community); class exercise (teacher/student).
- Try it: 5 steps, done for a student or child; ends with the student marking each line found or not found.

## 24 Open vs closed models (intermediate)
- Opener: direct answer (closed = the maker's app or API, or a licensed cloud provider); no thesis. Layout: paragraphs plus comparison table.
- Lessons (owns open-weight vs closed and license caution): weights vs code vs data; licenses differ and can change between versions; open-source label debated; table (runs where, data, setup, version changes, capability, rules); hosted open models; not legal advice. Figure open-vs-closed (relabeled "use it as a service").
- Why: "Open weights, open code, open data". Cross-ref: A plain-English AI glossary ("The entry for open-weight...").
- Quiz stems: downloadable files and what you may do; dental clinic admin, which question comes before choosing; real advantage of a closed model for a small team.
- Prompt patterns: none (checklist "open-or-closed-model").
- Example domains: dental clinic office admin (employee).
- Try it: fill-in card, no app; ends sending one question to the person who approves software.

## 25 Running a model on your own computer (advanced)
- Opener: reader's question; no thesis (merged into hook). Layout: Q&A (h3 questions under "Setting it up" and "Living with a local model"), no bold-lead lists.
- Lessons (owns local models): model files (weights) and runner; local server like hosted APIs, keep it local-only; fast memory fit; trusted sources, data-only formats, runner updates, code-running options off; speed, quality, context length (small runner defaults), missing extras, heat; privacy settings; small-model prompting. Defines open-weight, weights, API, context window.
- Why: "How a big model fits into less memory". Cross-ref: Open vs closed models ("see").
- Quiz stems: model loads but is very slow; why use a quantized version; what changes about safety locally.
- Prompt patterns: "One task, marked input" (TEXT START/END, YYYY-MM-DD output, unclear-date rule, NONE); nothing after.
- Example domains: date extraction from notes; documentation summaries.
- Try it: 3-step quick version; privacy line; ends marking each local answer good enough or not.

## 26 RAG: how an AI looks things up (advanced)
- Opener: short example ("Ask a chatbot about a rule that changed last year...") then scenario ("Say you're building", the batch's only use); second paragraph defines RAG.
- Lessons (owns RAG pipeline): chunks, embeddings, index, metadata; embedding + keyword search, re-scoring; numbered passages, citation check (catches made-up numbers only), NOT_IN_SOURCES, passages as information; chunk size, metadata filters, number of passages; retrieval misses vs generation errors; prompt injection in one clause; log retrieved passages.
- Why: "When the closest passage is the wrong one". Cross-ref: Context windows ("covers this trade-off").
- Quiz stems: wrong answer, what to check first (the batch's one "first?" stem); pizza boxes vs food-soiled cardboard; right passage but extra rule added.
- Prompt patterns: "Answer from numbered passages"; nothing after the box (next h2).
- Example domains: town recycling and bulky-waste rules (community).
- Try it: 5 steps, ten test questions with two unanswerable; ends labeling failures and fixing the larger group.

## 28 Chatbot vs workflow vs agent (beginner)
- Opener: short example (returns at a clothing store, three ways); no thesis. Layout: mostly paragraphs, h3 questions.
- Lessons (owns the three-way distinction): chatbot answers; workflow = steps and rules planned in advance (branches allowed); agent chooses steps, uses tools, until goal met or stopped (as 27); three questions; damaged-gift-jacket exchange as agent work; fewer free choices when costly; effort differs. Figure chatbot-workflow-agent. Defines tool.
- Why: "How a workflow can use AI without becoming an agent" (AI sorting into planned branches, each testable). Cross-ref: What is an AI agent ("As ... explains", the batch's one use).
- Quiz stems: weekly sales report pipeline is which; AI picks one of three planned replies, closest to which; costly, rarely changing task, safer choice.
- Prompt patterns: "Sort my tasks"; label caveat before the box; Why follows the box.
- Example domains: retail sales floor (shift lead notice, packing slips, damaged gift jacket) (employee).
- Try it: 4 steps, ranking by harm, no app (pen and page), end of a shift; ends naming who checks the top task and at which step.

## 29 Tools and function calling (advanced)
- Opener: direct answer + "If you've ever seen a chatbot..."; no thesis (cut). Layout: worked before/after (vague "Adds an event." description vs fixed one).
- Lessons (owns tool definitions and the round trip): five steps; JSON, schema, arguments, API defined; providers rename fields; parallel and forced calls; descriptions guide but code checks; few distinct tools; small results; actionable errors; permissions and least privilege; approval in one line; call IDs against duplicate retries; text inside results is information, no complete fix, limit tools; prompt injection referred to 13; limits and logs. Figure tool-calling (now with a "Your code" node).
- Why: "What the model actually sees of a tool" (moved before the box). Cross-ref: System prompts and structured output for builders ("described in").
- Quiz stems: tool called for to-do items, which change fixes it; past start time, what to return; search result says delete every event.
- Prompt patterns: valid JSON tool definition (label moved to the sentence before; wrap/rename for your provider); nothing after the box (next h2).
- Example domains: family calendar app (parent/family logistics).
- Try it: 5 steps, three should-call and two should-not messages; ends rewriting descriptions and sending all five again.

## 30 Memory in agents (intermediate)
- Opener: short statement ("An agent doesn't remember yesterday's work by itself") + "If you've ever reopened a chat app..."; no thesis. Layout: day-by-day (Week 1 Monday, Week 1 Wednesday, Week 3).
- Lessons (owns agent memory design): short-term = context window, long-term = stored notes added back (by your code or a service; app memory generally the same); facts, task records, working rules; search for large collections; model suggests, code decides and checks lines; confirmed, dated facts only; stale notes updated after confirmation; repeated, wrong-user, planted (refers to 27) and too many notes; see and delete. Figure agent-memory.
- Why: "Memory is more text in the window". Cross-ref: What is an AI agent (planted instructions).
- Quiz stems: where a remembered exam date came from; safest note to save (vs guess or whole session); saved date vs the learner's new date. Key 2-1-2.
- Prompt patterns: "Memory-write rule" inside the worked example (output YYYY-MM-DD | fact | source: user said OR user confirmed; only [session text] in brackets).
- Example domains: study helper agent for adults training as nursing assistants (vocational learner).
- Try it: 4 steps, on paper (the batch's only "on paper"); ends turning the remaining items into memory-note fields.

## 31 Planning and loops (advanced)
- Opener: short example (made-up trace of a coding agent repeating one search); no thesis line, no warmth line. Layout: mostly paragraphs, no bold-lead lists; box mid-article, Why at the end of the stop-conditions section.
- Lessons (owns plan-first vs step-by-step vs hybrid, plan as data, "a step is done only when the log shows it", stop reasons; shares agent loop and limits with 27): rewrite later steps after a surprise; step cap in the planning prompt; plan stored in code, updates checked against the tool log; budget/no-progress/canceled stops come from code; restart from the first unfinished step after checking steps left in "doing".
- Why: "How a loop can notice it's stuck" (tool name + arguments + hash of the meaningful part of the result; failure and rewrite counts; polling exception). Cross-ref: none by title.
- Quiz stems: a file the plan depends on doesn't exist; most reliable stop condition; "done" with no test command in the log. Key 3-3-2.
- Prompt patterns: "Plan with status and a stop reason" (label in title; stored plan in, one JSON update out; stop NONE/GOAL_MET/BLOCKED).
- Example domains: coding agent reproducing a bug report (builder).
- Try it: "a short work session"; 4 steps, cap check first, always-failing tool in a test copy; ends confirming the log ends with "no progress".

## 32 Your first simple agent, no code needed (beginner, gated)
- Opener: reader's question answered in the hook (five answers as questions); no thesis line. Layout: Step 1/2/3 walkthrough with a before/after goal; box then Why.
- Lessons (owns the paper agent design): goal with "done"; inputs only (connected email often opens the whole inbox: check, use a folder or filter); tools marked reads/changes; approval points in one sentence with a pointer to 35; hiding comments changes what others see, so a first agent lists suspected spam; everything that changes something waits for you in the first runs; two-part stop rule.
- Why: "What the page has to do with real apps". Cross-ref: Guardrails and human approval.
- Quiz stems: which goal is clearest; what a stop rule tells an agent; why leave income out of the inputs. Key 2-3-3.
- Prompt patterns: "Where would it have to guess?" (paste the five-part plan; list guess points by part; no rewrite).
- Example domains: weekly cooking-video comment roundup and a caption/title agent from a video script (creator); school emails to a list of forms and dates (parent/family).
- Try it: fill-in page (blank lines, no numbered list), on paper, no app; ends checking each circled tool is on the "Waits for my yes" line.

## 33 MCP and connectors (advanced)
- Opener: direct answer (with an "If you've connected one service to two AI apps" line mid-paragraph) + one-line thesis. Layout: Q&A (h3 questions); Why inside the Q&A section, before the box; "Writing a server" in paragraphs.
- Lessons (owns MCP/connectors): host, client, server; tools, resources, prompt templates; discovery returns ordinary tool definitions (round trip refers to 29); every definition and result uses context; local vs remote; spec details change (hedged); before connecting: who wrote it, descriptions can carry instructions and one server's text can affect another's tools, untrusted input + private data + outbound sending, remote servers can change without an update on your side.
- Why: "Local and remote servers carry different risks". Cross-ref: Tools and function calling.
- Quiz stems: what MCP standardizes; what a second app needs to use the same server (standard + connection type); local vs remote. Key 3-1-1.
- Prompt patterns: "Review a server's tool list" (four parts separated by |, NONE when no steering text; approval list); the "read it yourself" warning comes before the box.
- Example domains: support-ticket connector (builder).
- Try it: ranking, 4 steps; ends restricting the top-ranked connector and running one normal task.

## 34 When an agent goes wrong (intermediate)
- Opener: "When an agent does something wrong, the first reaction..." (two short sentences); Why box directly after the hook. Layout: Why first, symptom table, then a timeline ("The first hour").
- Lessons (owns incident response): second runs add changes; symptom / cause / first check table (check the system itself too); pause, save the log now, list changes, undo (customer may have acted), privacy contact and reporting rules, name the cause; fixes matched to causes (false "done" refers to 31's rule in one clause). Hidden instructions: no complete fix (27).
- Why: "Why a second run can make things worse". Cross-ref: What is an AI agent.
- Quiz stems: which record shows why it acted; why save the log early; two customers named J. Smith. Key 1-1-2.
- Prompt patterns: "Incident summary from a log" (fixed headings, NOT IN LOG; names removed). Box ends its section.
- Example domains: delivery company dispatch office (employee).
- Try it: conversation with a coworker (prose, no list, no app); ends agreeing who can pause the agent and where. Its questions ("how would we notice, who would notice first") are open, with no single answer.

## 35 Guardrails and human approval (intermediate)
- Opener: direct answer; no thesis line. Why placed before the box (end of "What needs a person").
- Lessons (owns human approval and approval-request design; code beats instructions shared with 13/31): rules in code vs instructions; run / run and report / ask first / never; four deciding questions; approval fatigue; code fills the request from the real tool call; exact approved action only, no answer = no; read the approval log every few weeks. Figure guardrail-approval-flow (caption notes the never group).
- Why: "What approval can't catch" (ends on the food bank's capped list). Cross-ref: none by title.
- Quiz stems: what an approval request for a group message shows; fifty mostly small, undoable requests unread; reminder rewritten after approval. Key 1-3-3.
- Prompt patterns: "Approval request format" (five labeled lines described in words; reply APPROVE).
- Example domains: community food bank volunteer coordinator (community).
- Try it: sort into four groups, 4 steps; ends asking whoever configured the agent to remove a "never" tool.

## 36 Evaluating an agent (advanced, gated)
- Opener: scenario ("Say you change one line..."), the batch's only "Say" lead-in; no thesis line. Why placed before the box.
- Lessons (owns agent evaluation): test set mix; success and must-never lines; about twelve tasks; sandbox with mock tools; grade outcome and path; code checks first, people with a rubric as the reference, a model grader for volume once it agrees on a sample; code verifies quoted evidence; repeated runs and pass rates; rerun after every change including provider model updates; record steps, time, tokens. Figure eval-loop (relabeled: tasks, several times, grade outcome and path).
- Why: "When a model grades a model". Cross-ref: none by title.
- Quiz stems: passes once then fails twice; why grade the path; what makes a model grader safe to rely on. Key 2-1-2.
- Prompt patterns: "Rubric grader with quoted evidence" (judgment criteria only, PASS/FAIL, NONE, JSON). Box ends its section.
- Example domains: home-care visit rescheduling agent (care work, builder side).
- Try it: "a work session, not five minutes"; 5 steps; ends rerunning the circled tasks after the next change and writing down which ones changed.

## 37 AI as a study partner (beginner)
- Opener: short example (two made-up students, same chemistry question); no thesis line.
- Lessons (owns hints-not-answers and explain-back): hint ladder; check answers in class materials; explain-back in prose; check textbook or class materials when feedback disagrees; school rules for graded work; app age rules; privacy as one pointer to 45.
- Why: "Explaining and remembering". Cross-ref: What not to paste into an AI tool.
- Quiz stems: learning to solve a problem type yourself; graded essay when AI is allowed for practice; chatbot disagrees with the textbook. Key 3-1-3.
- Prompt patterns: "Hints, one at a time" (SHOW ME). Box ends its section.
- Example domains: high school chemistry; university statistics (median vs mean), the batch's only university student.
- Try it: 3-step quick version; ends checking the questioned part in class notes.

## 38 Notes to flashcards and quizzes (beginner)
- Opener: direct answer ("With the right prompt..."); no thesis, no warmth line. Layout: Why at the top of the first section, before both boxes; no separate privacy section.
- Lessons (owns flashcards from notes): one privacy sentence pointing to 45 plus school app rules; card checks (in notes, one fact, needs recall); one-card-per-line import (hedged); teacher quiz with the key at the end, answer every question yourself first.
- Why: "What makes a flashcard work" (self-testing and spacing). Cross-ref: What not to paste into an AI tool.
- Quiz stems: why use only facts in your notes; what to remove from class notes with comments about students; when to review after the first session. Key 2-1-3.
- Prompt patterns: "Cards from my notes only" (question | answer per line, fewer if notes are thin); variant "Quiz from my handout only".
- Example domains: biology notes (mitosis); grade 7 class handout (teacher).
- Try it: 5 steps; ends setting a reminder for two days later.

## 39 Lesson plans with AI (intermediate)
- Opener: second-person moment ("It's Sunday evening, and you need..."); no thesis line. Layout: worked before/after (bare request, then the conditions to add); no prompt box (checklist instead); Why in the judgment section.
- Lessons (owns lesson planning): school/district rules first; needs instead of names, no test scores or health plans, small-class caution; conditions checklist including timings that add up and an end check; judgment checks; three-version differentiation; adult class at a community center.
- Why: "Standard codes and curriculum references". Cross-ref: none by title.
- Quiz stems: which class detail is safe to include; draft lists a standard code; five activities, your class needs longer for each. Key 1-2-2.
- Prompt patterns: none (checklist "lesson-plan-request": lines to put at the top of the request).
- Example domains: grade 5 equivalent fractions (teacher); older adults learning video calls at a community center (older adult/community).
- Try it: 5 steps, done with a colleague; ends rewriting the circled part before teaching.

## 40 AI for research and checking sources (intermediate)
- Opener: "Checking that a source exists is only the first check" + one-line thesis. Layout: myth/fact (three beliefs as h3 quotes), Why in the first half, no prompt box (research map as a plain list; source checks as a checklist), no bold-lead lists.
- Lessons (owns finding/reading sources, primary vs secondary): real-source failures; search links are where checking starts; news story vs study; class rules on AI for research first; research map instead of titles; checks (exists, says what's claimed, who and why, date with correction or retraction, original or report); quote or reword with a citation. Does not reteach 23's causes or checking sheet.
- Why: "Primary and secondary sources" (fields draw the line differently). Cross-ref: Hallucinations and how to catch them.
- Quiz stems: right author and title but wrong year; news article about a study; why ask for search phrases instead of sources. Key 3-3-2.
- Prompt patterns: research map described in prose (no titles; phrases, source kinds, questions, disagreements); checklist "source-checks-before-citing".
- Example domains: street trees and summer heat in cities (student research); class source check (teacher).
- Try it: single task in prose (no list); ends copying the supporting sentence with the page or section.

## 41 Summarizing long documents (beginner)
- Opener: reader's question ("What does this letter want me to do, and by when?"); no thesis. Layout: worked before/after (plain "summarize this" in a blockquote, then a summary built around one decision).
- Lessons (owns decision-first summaries): say what decision the summary is for; copy dates, amounts and conditions word for word; page if shown plus the first words quoted (search the original for them when pasted); check "unless/except/only if"; confirm with the sender, no money advice; apprentice electrician gets an own paragraph (rules for tomorrow's job); long files part by part, recheck conditions after combining (refers to 20); text-only file reading.
- Why: "How a short version can change the meaning" (after the box). Cross-ref: (the article "Context windows" explains why).
- Quiz stems: "may need to" became an order, what changed; why say what decision it's for; file far longer than the app handles. Key 2-1-3.
- Prompt patterns: "Action summary" (CAPS output headings WHAT I MUST DO / WHAT HAPPENS IF I DON'T / WHAT I CAN SKIP / QUESTIONS FOR THE SENDER, NOTHING FOUND).
- Example domains: retired woman's benefits review letter (older adult); apprentice electrician's training manual (vocational learner).
- Try it: 3-step quick version; ends marking each point same / missing a condition / not found.

## 42 Automating boring tasks (intermediate, gated)
- Opener: direct answer (daily or weekly, takes real time, mistake easy to fix); no thesis. Layout: sort table (how often / time / harm / verdict), then map, then a two-week side-by-side run.
- Lessons (owns choosing tasks to automate): rank by frequency, time and harm; fixed steps often need no AI; models help with messy input; task map labels; school data rules and approval before reading real messages; two-week side-by-side run; fallback, log, daily count, owner; attendance always checked by a person; manual note. Refers to 28 and 35 only.
- Why: "Silent failures in automations" (input changes, 03/04 dates, skipped items, counts). Cross-refs: see "Chatbot vs workflow vs agent"; see "Guardrails and human approval".
- Quiz stems: good first school-office task; habit that catches skipped messages; which setup handles a NEEDS JUDGMENT step. Key 1-3-3.
- Prompt patterns: "Task map" (steps labeled SAME EVERY TIME / NEEDS JUDGMENT / HARD TO UNDO, no software suggestions). One bold-lead list (4 items).
- Example domains: school office admin (absence messages, permission slips) (employee).
- Try it: ranking, 4 steps, about fifteen minutes; ends taking the map to whoever approves new software.

## 43 AI for spreadsheets (intermediate)
- Opener: short example ("A formula that adds the wrong column still gives you a number"); no thesis. Layout: Why in the first section before the box; h3s under "Cleaning and reading sheets".
- Lessons (owns spreadsheet formulas with hand checks): ask for each part explained; name your program (separators differ); column names plus made-up rows; test on rows worked out by hand, three real rows, a grand total another way, filled cells vs rows; uploaded-sheet analysis may be predicted text; clean via steps, count rows; CSV defined, split-text option (no cross-ref to 12); pivot table defined.
- Why: "Why a formula can look right and still be wrong" (ranges, text numbers, moving references, settings). Cross-ref: (see "What not to paste into an AI tool" for the rest).
- Quiz stems: quickest real test of a formula; total of hours too low; which part of a customer-orders sheet goes into the request. Key 3-1-1.
- Prompt patterns: "Formula with a hand check" (columns, three made-up rows in brackets, one copyable formula per crew, explain each part, give the result for those rows).
- Example domains: landscaping company crew hours (trade owner 1 of 2).
- Try it: 5 steps on a copy or a made-up sheet; ends adding a tricky row and rechecking.

## 44 An AI-assisted practice routine (beginner, gated)
- Opener: second-person moment ("You want to get better at speaking to the camera..."); no thesis. Layout: day-by-day week (Monday to Friday h3s), Why before the box.
- Lessons (owns the weekly practice routine): one focus per week; first attempt alone, feedback on one thing, practice the change, make it harder, redo Monday and compare; written focus, ten minutes on busy days; test-bound learner's Wednesday (practice questions, check wrong answers in the official handbook). Refers to 38 only; agreeable chatbots in one clause (06 owns).
- Why: "What a chatbot can't see in your practice" (text only, recordings can be misjudged, too kind). Cross-ref: see "Notes to flashcards and quizzes".
- Quiz stems: why one focus all week; chatbot rewrote the whole script, which reply keeps the practice yours; what typed words of a video can't show. Key 1-3-1.
- Prompt patterns: "Feedback on one thing" (one named focus, one part that works, one change, no rewrite).
- Example domains: creator speaking on camera; adult on an evening driving-theory course (adult learner).
- Try it: fill-in weekly plan (no numbered steps, about twenty minutes a day); ends doing Monday's attempt today.

## 45 What not to paste into an AI tool (beginner)
- Opener: direct answer ("Most of what people paste into AI apps is fine..."); no thesis. Layout: sort into three h2 groups (fine / remove details first / never), Why in the first half, no prompt box.
- Lessons (owns what never to paste and app privacy settings): fine as is; roles for names, describe instead of paste, crop screenshots, photo location data; parent school-form worked example in prose; never (two paragraphs, no list): passwords and codes, access keys, ID and account numbers, forbidden work/school material; after a mistaken paste: change the password or cancel and replace keys or recovery codes, delete the chat, shared link and memory entry, tell IT or security at work; settings: training, retention, memory, temporary chats (may still be kept briefly), shared links; work accounts.
- Why: "Where your text goes after you send it". Cross-ref: none.
- Quiz stems: school form about a child's allergy; what never goes in even in a trusted app; training turned off, what is still true. Key 2-3-3.
- Prompt patterns: none (checklist "before-you-paste"). No bold-lead lists.
- Example domains: parent with a school form (parent); "Customer A" at work.
- Try it: 4 steps, done with a parent, partner or coworker; each reads their own memory list privately; ends changing one setting on a personal account.

## 46 Bias in AI (intermediate)
- Opener: common belief ("It's easy to assume a computer program can't take sides"); no thesis. Layout: worked comparison (one detail changed between two requests), then a classroom activity; Why in the first half.
- Lessons (owns bias in AI): data, labels, training choices (refers to 22), use; dialect example; fixes incomplete, can overcorrect, measurement debated; one-detail test in a temporary chat or with memory off, three runs per version because answers vary; invented details only; classroom table in a school-allowed app; an AI app never the only judge of students.
- Why: "Why removing a label doesn't remove bias" (proxies; hypothetical job-application sorter). Cross-ref: (see "How LLMs are trained").
- Quiz stems: job-application sorter without gender data; girl/boy lists differ the same way each time; fair test of harsher essay feedback. Key 3-1-3.
- Prompt patterns: "One detail changed" (career list for [a 16-year-old girl], rerun with one bracket changed).
- Example domains: high school career ideas; classroom group activity (teacher).
- Try it: 4 steps on paper with classmates, no app; ends writing a request that states the default detail yourself.

## 47 Fact-checking an answer in five minutes (beginner)
- Opener: "If you've ever stopped before forwarding..." (not the opener's last line); no thesis. Layout: minute-by-minute timeline (h3 per minute), no prompt box.
- Lessons (owns the five-minute routine): minute 1 pick the claim you'll act on or repeat; minute 2 rewrite as a short checkable sentence; minutes 3-4 one source close to the fact, asking the chatbot again doesn't count; minute 5 confirmed / different / not found; stop the timer when sources disagree; health, money, law and safety go to a pharmacist, doctor or lawyer, schoolwork to a teacher; training cutoff. Points to 23 (warning signs) and 40 (judging a source) in one quoted clause each (task requirement).
- Why: "Limits of a five-minute check". Cross-refs: see the warning signs in "Hallucinations and how to catch them"; see "AI for research and checking sources".
- Quiz stems: twelve facts and five minutes; where to check a museum's first-Sunday free entry; no source found, which note goes next to it. Key 1-2-1.
- Prompt patterns: none (checklist "five-minute-fact-check").
- Example domains: city museum free Sunday; student's science-project plant.
- Try it: single timed task in prose (no list); ends writing the result with the source's name.

## 48 Copyright and AI (not legal advice) (intermediate)
- Opener: three reader questions ("an AI app"); "not legal advice" paragraph second; copyright defined as usually first held by the creator or their employer (rules differ by country, still changing, ask a qualified lawyer). Layout: Q&A (h3 per question), Why in the first half, before the box.
- Lessons (owns copyright basics for creators): app terms decide use; use is different from owning, human input and protection (hedged, "in some places"), you might not be able to stop copying; your own creative choices; look-alike characters and logos; the app's terms cover what you paste; others' work, styles of living artists, licenses, client permission; labeling where a platform rule, law or contract requires it; keep a contribution record (musician; marketing assistant gets an own paragraph: project folder); when to ask a lawyer (contracts, selling prints, real faces or voices, takedown notices).
- Why: "Where the open questions are". Cross-ref: none.
- Quiz stems: terms allow use, what's still uncertain; lyrics pasted for a new song; why keep a record. Key 3-3-1.
- Prompt patterns: "Contribution record" (MADE BY ME / MADE WITH AN AI APP / FROM OTHER PEOPLE, UNKNOWN, nothing added).
- Example domains: musician's lyric video (creator); marketing assistant's brochure (employee).
- Try it: 5 steps, about fifteen minutes; ends replacing or sourcing every UNKNOWN line before publishing.

## 49 A calm guide for parents (beginner)
- Opener: calm statement ("Your child may already meet AI..."); no thesis. Layout: mostly paragraphs, no checklist, no bold-lead lists; Why in the first half, before the box.
- Lessons (owns talking with children about AI): specific, lecture-free questions; let the child show you; listen before rules; chatbot predicts the next piece of text, can be wrong, isn't a person; family rules written together, no trouble for telling; school rules first; minimum ages in terms; when to ask the school, a counselor or a doctor; immediate danger = local emergency number; adult or stranger asking for photos, secrets or meeting = police or a child-protection hotline; report features; sexual content involving a child is never saved or forwarded, only reported. No development or harm claims.
- Why: "Why a chatbot can feel like a friend". Cross-ref: The full list is in "What not to paste into an AI tool".
- Quiz stems: child calls a chatbot a friend, which reply helps you understand; school project, what to check about it; still worried days later. Key 2-1-1.
- Prompt patterns: "Our family agreement" (no example-values label) (four answered questions in brackets, five lines for a child's reading age).
- Example domains: parent and child at home (parent/family).
- Try it: a conversation in prose, no screen (car ride or meal); ends writing one agreed rule where both will see it.

## 50 An AI-use policy for a small team (intermediate)
- Opener: short example (two coworkers guessing) + one-line thesis (the batch's only thesis). Layout: sample policy with bracketed blanks in a copy box, then a fill-in walkthrough by line number.
- Lessons (owns the team AI-use policy): scope line plus nine lines (apps, good uses, never paste, check before it goes out, approval, telling people incl. wherever law or contract requires, problems with no blame and the owner's check on legal notice duties, no AI-only decisions on hiring, pay or discipline, review); ask both users and avoiders; sector rules may be stricter; one owner by role; work vs personal accounts; one page; practice with situations. Not legal or HR advice. Points to 45, 47 and 35 in one quoted clause each.
- Why: "What a written policy won't fix". Cross-refs (quoted): "What not to paste into an AI tool"; "Fact-checking an answer in five minutes"; "Guardrails and human approval".
- Quiz stems: coworker pasted a complaint with contact details; why name one owner; tool that sends email by itself. Key 1-1-2.
- Prompt patterns: sample policy box; "Situations from our policy" (six situations, allowed / not allowed / check with the owner, deciding line at the end); no example-values labels.
- Example domains: moving company office team (trade/business owner 2 of 2).
- Try it: 5 steps with teammates; ends writing the first review date into line 9.

## Batch E counts (after review edits, v6 self-check)
"If you've ever": 2 (46, 47); "You've probably": 3 (43, 48, 50); at most one per article, none closes an opener. Example-values label only in box titles, dropped in 49 and 50. No prompt box: 45, 47. Why before any box or in the first half: 43, 44, 45, 46, 48, 49. Try its without a numbered list: 44, 47, 49. Q1 key 2: 41, 45, 49. Bold-lead lists: 42 only. Hypothetical lead-ins: one "Picture a" (46); no "It's [time]" openers. Cross-references quoted, never a sentence subject; more than one only in 42 (28, 35), 47 (23, 40) and 50 (45, 47, 35). "tool" means a model capability; the product is an "app".
