<?php defined( 'ABSPATH' ) || exit; ?>
<!--ita {"slug":"30-memory-in-agents","title":"Memory in agents","category":"agents","excerpt":"How an agent remembers: the current context window plus saved notes that are stored and added back. What to save, what to skip, and what fails.","reviewed":"2026-11-16","gated":false,"level":"intermediate","audiences":["builders"],"check":["A language model keeps no information between separate requests; anything an agent remembers is text that was saved, by the surrounding code or by a service it uses, and added to a later request.","An agent's short-term memory is what is in its current context window, while long-term memory is notes stored outside the model, such as in a file or database, and added back when needed.","Long-term memory is often retrieved by searching saved notes for the ones that match the current task, much like a search over documents.","Unless the code labels them, a model cannot tell a saved memory note from any other text in its context, and a wrong or outdated note can be repeated in every later session.","Instructions planted in content an agent saved can affect later sessions, so what gets written to memory should be checked."]} -->
<p>An agent doesn't remember yesterday's work by itself. The model inside it keeps nothing between requests. Anything an agent "remembers" is text that was saved, by your code or by a service you use, and added to a later request. If you've ever reopened a chat app and found it already knew your name, a saved note did that.</p>

<h2>Two kinds of memory</h2>
[ita_figure name="agent-memory" alt="An agent reads from and writes to short-term memory, the current chat, and long-term memory, saved notes it can find later." caption="Short-term memory is the current chat; long-term memory is saved notes, found when needed."]
<p>Short-term memory is whatever sits in the [ita_term define="The amount of text, counted in tokens, that a model can take into account at one time."]context window[/ita_term] right now. That includes the instructions, the user's [ita_term define="The message or instructions you type to an AI app to tell it what you want."]prompt[/ita_term], earlier replies, tool results and any notes added for this task. Its size is limited by that window.</p>
<p>Long-term memory is stored outside the model, in a file or a database. Your code finds the notes that matter and adds them to the window. Chat apps with a memory feature generally work this way too, adding saved notes to later chats.</p>
<p>Builders often keep three kinds of long-term notes. Some are facts about the user, such as their course or preferred language. Some are records of past tasks, with what was tried and what worked. Others are working rules the user has stated, such as "always show times in 24-hour format". Short notes are usually added to every request. Larger collections are often searched, the same way a search over documents works, and only the closest matches are added.</p>

<h2>One learner, three weeks</h2>
<p>Take a study helper agent for adults training as nursing assistants. Here is how its memory might work across three weeks of one learner's course.</p>
<h3>Week 1, Monday: deciding what to save</h3>
<p>In the first session, the learner names her course modules and her exam date, and asks for times in 24-hour format. She also says a quiz on infection control "went badly". A useful rule is that the model suggests notes and your code decides what is stored. Stable facts she stated or confirmed are kept, with a date and a source. The guess that she struggles with infection control is not, unless she confirms it. Before anything is stored, your code also checks each suggested line for the right format and a source. It rejects passwords, ID numbers and other data that must never be kept. At the end of the session, the agent sends the model this request:</p>
[ita_prompt title="Memory-write rule"]
Review this session and suggest notes to save for future sessions.
Suggest a note only if the user stated or confirmed it, and it is likely to stay true for weeks.
Write each note on one line, in this form:
YYYY-MM-DD | fact | source: user said OR user confirmed
Do not suggest guesses about the user, passwords, ID numbers, health details or anything the user asked you to forget.
If nothing qualifies, reply: NO NEW NOTES
Session:
[session text]
[/ita_prompt]

<h3>Week 1, Wednesday: reading notes back</h3>
<p>She opens a new session and asks for a review plan. Your code searches her notes, finds the module list and the exam date, and adds them to the request with their dates and sources. The plan uses her real modules, and it shows times in 24-hour format without being asked.</p>
<h3>Week 3: a note goes stale</h3>
<p>She says the exam has moved from the 12th to the 19th. The saved note still says the 12th. The agent uses the newer date, asks her to confirm it, and your code updates the note with today's date. Without that update, every later session would plan around the wrong day.</p>

<h2>What else goes wrong with saved notes</h2>
<p>Saved notes fail in a few predictable ways:</p>
<ul>
<li><strong>Wrong notes that repeat.</strong> A note saved by mistake is added to every later session until someone removes it. Users need a way to see and delete what's stored about them.</li>
<li><strong>Notes from the wrong person.</strong> Each user's memory has to stay separate, with a filter by user before any search.</li>
<li><strong>Planted instructions.</strong> Text an agent saved from a web page or email can carry hidden instructions (the risk described in "What is an AI agent"). Once stored, they can affect later sessions.</li>
<li><strong>Too many notes.</strong> Every note takes space in the window, so a cap on notes per request keeps room for the task itself.</li>
</ul>
[ita_why title="Memory is more text in the window"]
<p>To the model, a memory note is just text. Unless your code labels it, the model can't tell a note from a message the user typed just now.</p>
<p>Label notes clearly, with their date and source, so the model can judge their age. When a note and a new message disagree, the model needs a rule. Tell it in its instructions to prefer the newer message. Then ask the user before the note is updated.</p>
[/ita_why]

[ita_quiz]
[ita_q q="An agent recalls a learner's exam date from last week. Where did that come from?" answers="The model's parameters, updated after the last chat|A saved note that was added to this request|The context window, which keeps every past chat" correct="2" why="The model keeps nothing between requests; the date was stored outside it and added back."]
[ita_q q="Which note is safest to save to long-term memory?" answers="The learner's confirmed module list, with the date|The agent's guess that she finds infection control hard|Every message from the session, so nothing is lost" correct="1" why="A confirmed, dated fact is stable and checkable; guesses and whole sessions bring errors and clutter into later requests."]
[ita_q q="A saved note says the exam is on the 12th, but the learner now says the 19th. Which date does the agent plan around?" answers="Keep the saved note, since stored memory is more reliable|Use the newer date and update the note after she confirms|Ask the model which date seems more likely" correct="2" why="The newer statement from the user wins, and the stored note should be corrected so the error doesn't repeat."]
[/ita_quiz]

<h2>Try it</h2>
<p>Use a sheet of paper for this one.</p>
<ol>
<li>Write the job of one agent you build or plan, in one line.</li>
<li>List everything it might want to remember between sessions.</li>
<li>Next to each item, write who confirms it, when it expires and who can see it.</li>
<li>Draw a line through every item where you can't answer all three. Turn the rest into the fields of your memory note.</li>
</ol>
