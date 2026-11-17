<?php defined( 'ABSPATH' ) || exit; ?>
<!--ita {"slug":"42-automating-boring-tasks","title":"Automating boring tasks","category":"work-and-learning","excerpt":"How to pick which repetitive work tasks to automate, map the steps before you build anything, and notice when an automation fails quietly.","reviewed":"2026-11-16","gated":true,"level":"intermediate","audiences":["workers-and-business-owners"],"check":["Many fixed, repetitive steps, such as renaming files by a rule or sending a scheduled reminder, can be automated with ordinary rules in existing software and do not need an AI model.","AI models are often useful in automations for reading messy input, such as messages written in different ways, and pulling out details.","Automations can fail without any error when their input changes, for example when messages arrive in a new format.","A date written as 03/04 means March 4 in some countries and April 3 in others, and software or a model can read it the wrong way.","Comparing counts, such as messages received versus rows added, is a simple way to notice items an automation skipped."]} -->
<p>Start with a task that comes up every day or every week and takes real time, where a mistake is easy to fix. Tasks where a mistake would hurt someone can still get AI help, but a person should check every result.</p>

<h2>Rank your tasks before you choose one</h2>
<p>A school office admin handles messages from parents about absent children, along with permission slips, reminders and an occasional complaint. An admin there could sort the week's tasks with three questions. How often does it come up? How much time does it take? What happens if it's done wrong?</p>
<table>
<caption>One school office week, sorted by three questions</caption>
<thead>
<tr><th scope="col">Task</th><th scope="col">How often</th><th scope="col">Time each week</th><th scope="col">Harm if wrong</th><th scope="col">Verdict</th></tr>
</thead>
<tbody>
<tr><th scope="row">Rename and file scanned permission slips</th><td>Daily</td><td>About an hour</td><td>Low: a misfiled slip can be moved</td><td>Good first candidate</td></tr>
<tr><th scope="row">Copy absence messages into the attendance sheet</th><td>Daily</td><td>About an hour</td><td>High: a missed absence may mean nobody checks on a child</td><td>Automate the copying; a person checks every entry</td></tr>
<tr><th scope="row">Remind staff to send newsletter items</th><td>Weekly</td><td>A few minutes</td><td>Low</td><td>A scheduled message is enough</td></tr>
<tr><th scope="row">Reply to a parent's complaint</th><td>A few times a term</td><td>Varies</td><td>High</td><td>Keep it yours; AI can help with a draft</td></tr>
</tbody>
</table>
<p>Not every automation needs AI. Fixed steps, like a naming rule or a weekly reminder, can often be ordinary rules in software the office already uses. A model helps most with messy input, such as absence messages that every parent writes differently. If you're not sure your task needs an agent at all, see "Chatbot vs workflow vs agent".</p>

<h2>Map the steps before you build</h2>
<p>Write the task as the steps a person takes today, then label each step. A chatbot can help with the first draft. Describe the task in your [ita_term define="The message or instructions you type to an AI app to tell it what you want."]prompt[/ita_term] instead of pasting real messages or student names.</p>
[ita_prompt title="Task map"]
Here is a task I do by hand every day: [copy each parent's absence message into our attendance sheet].
1. List the steps a person takes, in order, one per line.
2. Label each step SAME EVERY TIME, NEEDS JUDGMENT or HARD TO UNDO.
3. For each NEEDS JUDGMENT step, write the question the person is answering.
4. Do not suggest any software.
[/ita_prompt]

<p>Steps labeled SAME EVERY TIME are the easiest to automate. A step that needs judgment can still be automated if it has a clear fallback. For example: "If the message doesn't name a child and a date, move it to a folder for a person to read."</p>
<p>Any step that is hard to undo, such as sending a message to a family, waits for a person to approve it. To choose those steps, see "Guardrails and human approval".</p>

<h2>Run it next to your usual way</h2>
<p>Before any automation reads real parent messages, check the school's data rules and get approval. Then, for the first two weeks, do the task by hand as usual and let the automation run beside you. Compare the two results at the end of each day, and fix the automation before you trust it alone.</p>
<p>Once it stops running next to the hand copy, give it four things:</p>
<ul>
<li><strong>A fallback.</strong> Anything it can't read goes to a person instead of into the sheet with a guess.</li>
<li><strong>A log.</strong> A simple record of what it did each time, with the time and the item.</li>
<li><strong>A count.</strong> Each day, someone compares the number of messages with the number of new rows.</li>
<li><strong>An owner.</strong> One named person fixes it and checks it when the input changes, for example when the school changes its absence form.</li>
</ul>
<p>For attendance, a person still checks every entry, because a missed absence matters too much to leave to a count. Keep a short written note of how to do the task by hand. If the automation stops during a busy week, anyone in the office can still do the work.</p>
[ita_why title="Silent failures in automations"]
<p>An automation that stops with an error is easy to notice. The harder failures look like success.</p>
<ul>
<li>The input changes. Messages arrive in a new format, and the automation copies the wrong line.</li>
<li>Dates are misread. "Back on 03/04" means March 4 in some countries and April 3 in others.</li>
<li>Some items are skipped. Ten messages arrive, eight rows appear, and nothing reports the missing two.</li>
</ul>
<p>The daily count catches skipped items. For dates, have the automation write the month as a word, so a misread date is easy to spot.</p>
[/ita_why]

[ita_quiz]
[ita_q q="Which school office task makes a good first candidate to automate?" answers="Renaming and filing scanned permission slips|Replying to a parent's complaint|Deciding which families need a follow-up call" correct="1" why="It comes up every day, takes time, and a misfiled slip is easy to fix."]
[ita_q q="An automation copies absence messages into the attendance sheet. Which habit catches skipped messages?" answers="Reading the automation's settings once a month|Turning on error emails for the automation|Comparing the number of messages with the rows added each day" correct="3" why="A skipped message may cause no error, but it does leave the two counts different."]
[ita_q q="A step in your task map is labeled NEEDS JUDGMENT. Which setup handles it safely?" answers="Remove the step so the rest can run without a person|Let the model decide, and review its choices once a term|Let the model suggest, with a fallback to a person" correct="3" why="Judgment steps need a clear path to a person when a case isn't simple."]
[/ita_quiz]

<h2>Try it</h2>
<p>This takes about fifteen minutes.</p>
<ol>
<li>List eight things you did more than once at work last week, one per line.</li>
<li>Next to each, write how often it comes up and roughly how long it takes each week. Add what would go wrong if it were done badly.</li>
<li>Rank them: frequent, slow and low-harm tasks at the top; rare or high-harm tasks at the bottom.</li>
<li>Run the task map request on your top task, using a description only, and take the result to whoever approves new software at your workplace.</li>
</ol>
