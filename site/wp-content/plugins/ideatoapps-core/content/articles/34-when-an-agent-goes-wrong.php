<?php defined( 'ABSPATH' ) || exit; ?>
<!--ita {"slug":"34-when-an-agent-goes-wrong","title":"When an agent goes wrong","category":"agents","excerpt":"Common ways agents fail, how to tell them apart from the log, and what to do in the first hour after an agent has acted.","reviewed":"2026-11-16","gated":false,"level":"intermediate","audiences":["workers-and-business-owners","builders"],"check":["Running an agent task again after a mistake can add a second set of changes, because the first run may already have changed data the second run reads.","Agents can act on the wrong record when two records have similar names or when they take the first search result without checking it.","Saved notes or old documents added to an agent's context can lead it to act on outdated information.","Agents that read web pages, emails or files can follow instructions hidden in that text, and there is no complete fix for this yet.","A tool log shows what the tool reported, which is not always what happened, so the system itself (such as a sent-messages list) is worth checking too.","Some logs are kept only for a limited time, and some workplaces have reporting rules when personal details go to the wrong person."]} -->
<p>When an agent does something wrong, the first reaction is often to run the task again. Stop first. Check what happened, and fix the cause before the next run.</p>
[ita_why title="Why a second run can make things worse"]
<p>A second run starts from a changed situation. The first run may already have moved a delivery slot or sent a text, so the second run reads different data and can make a second change on top of the first.</p>
<p>If the cause was the goal, a tool or a piece of text the agent read, none of that has changed either. The same mistake is likely to happen again, and a customer may end up with two messages that disagree.</p>
[/ita_why]

<h2>What it looks like</h2>
<p>Agent failures look a lot like ordinary automation failures, like an automatic email that went to the wrong list. The cause is usually in the goal and [ita_term define="The message or instructions you type to an AI app to tell it what you want."]prompt[/ita_term], the tools, or the text the agent read. Sometimes it's a plain wrong guess by the model.</p>
<p>In a delivery company's dispatch office, for example, an agent might move delivery slots and text customers the new time. Each row of this table could happen there.</p>
<table>
<caption>Agent symptoms, likely causes and first checks</caption>
<thead>
<tr><th scope="col">Symptom</th><th scope="col">Likely cause</th><th scope="col">Check first</th></tr>
</thead>
<tbody>
<tr><th scope="row">It says a task is done, but nothing changed.</th><td>The model wrote "done" without a successful tool result.</td><td>The tool log, and the system itself (for example, the sent-messages list).</td></tr>
<tr><th scope="row">It acted on the wrong customer or file.</th><td>Two similar names, or it took the first search result.</td><td>Which ID it used, and where that ID came from.</td></tr>
<tr><th scope="row">It did more than you asked.</th><td>A broad goal plus tools that allow extra actions.</td><td>The goal's wording and the list of tools.</td></tr>
<tr><th scope="row">It used old information.</th><td>An old note or document was added to what it read.</td><td>The dates on what it read before acting.</td></tr>
<tr><th scope="row">It followed an instruction nobody gave.</th><td>Text in a page, email or file it read.</td><td>The text it read just before the action.</td></tr>
<tr><th scope="row">It stopped halfway.</th><td>A step limit, a timeout or a failing tool.</td><td>The last step in the log and the stop reason.</td></tr>
</tbody>
</table>
<p>The hidden-instruction row has no complete fix yet, which is why limited tools and approvals matter (see "What is an AI agent").</p>

<h2>The first hour</h2>
<h3>In the first minutes</h3>
<p>Pause the agent, including any scheduled runs. If you can't pause it, turn off the tool it used, for example its access to the text service. Save the log now, since some logs are kept only for a short time.</p>
<h3>Within the hour</h3>
<p>List what changed: messages sent, bookings moved, files edited. Undo what you can, such as moving the delivery slot back, but remember that the customer may already have acted on the change. For messages already sent, follow your workplace's usual process for telling customers about a mistake. If personal details went to the wrong person, tell whoever handles privacy at your workplace; there may be reporting rules.</p>
<h3>Before anyone runs it again</h3>
<p>Keep the inputs and the instructions as they were at the time. Then name the cause, using the table above.</p>
<p>A long log is hard to read under pressure, and a chatbot can turn it into a short summary. Remove customer names and phone numbers first, and check the summary against the log before you share it.</p>
[ita_prompt title="Incident summary from a log"]
Below is the log of one agent run. Use only what the log shows.
Write a short incident summary with these headings:
Goal it was given:
Actions in order: one line each, with the time and the tool used
Changes outside the agent: messages sent, records edited, files moved
Can each change be undone: YES, NO or NOT IN LOG
First unexpected step: the earliest line where the log differs from the goal
If something is not in the log, write NOT IN LOG. Do not guess at causes.
Log:
[paste the log, with names and phone numbers removed]
[/ita_prompt]

<h2>Fixing the cause</h2>
<p>Each cause has a typical fix:</p>
<ul>
<li><strong>A false "done":</strong> have the program accept done only when the log shows a matching tool result.</li>
<li><strong>Unclear goal:</strong> narrow it, and say what "done" means.</li>
<li><strong>Too many tools:</strong> remove the ones the task doesn't need, or make them read-only.</li>
<li><strong>A risky action ran without anyone seeing it:</strong> add an approval step before that action.</li>
<li><strong>Old or wrong inputs:</strong> add dates and sources to what it reads, and delete notes that are out of date.</li>
<li><strong>Outside text gave instructions:</strong> limit what the agent may do after reading untrusted text, such as no sending without approval.</li>
<li><strong>The same wrong judgment again and again:</strong> break the task into fixed steps, so the model makes fewer choices.</li>
</ul>
<p>A builder can also add the failed case to the agent's test set. Rerun it in a safe setup before real work starts again, and write the cause and the fix where your team can find them.</p>

[ita_quiz]
[ita_q q="The agent texted a customer about a slot nobody asked to move. Which record shows why it acted?" answers="The text it read just before the action|The customer's earlier reply to a reminder|The list of tools it was allowed to use" correct="1" why="The input right before an unexpected action often holds the instruction or detail that triggered it."]
[ita_q q="Why save the agent's log early, before you start undoing changes?" answers="Some logs are kept only for a short time, and you need them to find the cause|Saving the log also pauses the agent|The log is the only way to undo a sent text" correct="1" why="Without the log you may never learn what caused the mistake."]
[ita_q q="The agent changed a booking for 'J. Smith', but two customers share that name. Which fix fits?" answers="Let it pick the customer with the most recent order|Make it confirm the customer ID before any change|Give it a longer step limit so it can check more records" correct="2" why="A check on a unique ID stops the wrong-record mistake at its source."]
[/ita_quiz]

<h2>Try it</h2>
<p>Have a short talk with a coworker who uses the same agent or automation; nothing gets run. Each of you picks one row of the table above and asks two questions about it: how would we notice, and who would notice first? Then talk through what would need undoing, and whether anyone outside the team would need to be told. Before you finish, agree who can pause the agent and write down where the pause setting is.</p>
