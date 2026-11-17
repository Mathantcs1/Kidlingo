<?php defined( 'ABSPATH' ) || exit; ?>
<!--ita {"slug":"32-your-first-simple-agent-no-code-needed","title":"Your first simple agent, no code needed","category":"agents","excerpt":"Design a small agent on one page: its goal, what it reads, what it may do, when it must ask you, and when it stops.","reviewed":"2026-11-16","gated":true,"level":"beginner","audiences":["beginners","workers-and-business-owners","creators"],"check":["Designing an agent needs answers to five questions: its goal, its inputs, its tools, the points where a person must approve, and a rule for when to stop.","Actions that other people see, that cost money or that are hard to undo are commonly set to wait for a person's approval.","Without a stop rule or a step limit, an agent can keep repeating its steps.","In many apps, connecting an email account gives access to the whole inbox, and some apps let you limit it to a folder or filter.","Apps that let people build agents without code usually ask for the same parts under other names, such as instructions, connected accounts, permissions and limits; the names and options differ between apps and change often."]} -->
<p>Can you plan an agent without writing any code? Yes. Every agent needs the same five answers. What is it for, what does it read, what may it do, when must it ask you, and when does it stop? You can write all five on one page before you open any app or type a single [ita_term define="The message or instructions you type to an AI app to tell it what you want."]prompt[/ita_term].</p>

<h2>Step 1: the goal and the inputs</h2>
<p>You've probably done some of this already, every time you explained a task to someone new. An [ita_term define="A program that uses an AI model to choose steps, use tools and repeat them until a goal is met."]agent[/ita_term] works toward a goal on its own, so the goal has to be clear. Write it in one sentence that says what "done" looks like.</p>
<p>One example: a creator posts a cooking video every week and gets many comments. Here is the same goal, first vague and then clear:</p>
<ul>
<li><strong>Before:</strong> "Help me with my comments."</li>
<li><strong>After:</strong> "Every Monday, sort last week's comments into questions, praise and spam, and draft a reply to each question."</li>
</ul>
<p>The second goal says when the agent runs, what it works on and what it hands back. You could check its work against that one sentence.</p>
<p>Next, list the inputs. These are the things the agent needs to read. For the comment roundup, that's the comments on one video, plus a short note about how you like to reply. Leave out everything else. It doesn't need your messages, your income or other people's private details.</p>
<p>At home, a parent might write: "Every Sunday, list the forms to sign and the dates to remember from this week's school emails." On paper, the only input is the school emails. In a real app, connecting an email account often opens the whole inbox. Check what the connection can reach, and use a folder or filter if the app allows it.</p>

<h2>Step 2: tools and approval points</h2>
<p>A [ita_term define="A capability the model can call, like searching the web, reading a file or adding a calendar entry."]tool[/ita_term] is an action the agent can take. List each one, and write next to it whether it only reads or also changes something.</p>
<ul>
<li>Read the comments on one video: only reads.</li>
<li>Hide a comment as spam: changes what other people see.</li>
<li>Post a reply: changes what other people see.</li>
</ul>
<p>Now mark the approval points, the actions that wait for you to say yes. Anything other people will see, anything that costs money and anything hard to undo belongs there. To choose these points with more care, see "Guardrails and human approval".</p>
<p>For the roundup, posting a reply waits for you. Hiding a comment also changes what others see, and a mistake could hide a real fan's question. So in a first agent, have it list suspected spam for you to hide yourself.</p>
<p>A creator could plan a second agent the same way: one that drafts a caption and three title ideas from each new video's script. Posting the caption would wait for your yes. For the parent's list, making the list can run on its own, and a reply to the school would wait.</p>
<p>For the first few runs of any agent, set every tool that changes something to wait for you. Check the results before you let anything run on its own.</p>

<h2>Step 3: the stop rule</h2>
<p>An agent repeats its steps until something tells it to stop. A good stop rule has two parts.</p>
<ol>
<li><strong>When the work is finished.</strong> "Stop when every comment has a label and every question has a draft reply."</li>
<li><strong>When to give up and ask.</strong> "If you can't read a comment, or you're not sure it's spam, put it on a list for me. Then go to the next comment."</li>
</ol>
<p>Without the second part, an unclear case can make the agent repeat the same step, or push it to guess.</p>
<p>When your page is ready, a chatbot can look for weak spots in it. Copy this and put your own page in place of the example values:</p>
[ita_prompt title="Where would it have to guess?"]
Here is my plan for a simple AI agent.
Goal: [Every Monday, sort last week's comments into questions, praise and spam, and draft a reply to each question.]
Inputs: [the comments on one video; a short note about my usual tone]
Tools: [read comments; list suspected spam; post a reply]
Needs my approval: [posting any reply]
Stop rule: [stop when every comment has a label and every question has a draft reply]
Do not rewrite the plan.
List each place where an agent following this plan would have to guess, one per line.
For each one, say which part of the plan it belongs to.
[/ita_prompt]

<p>Fix each guess by adding one line to your page, or by making the goal smaller.</p>
[ita_why title="What the page has to do with real apps"]
<p>Apps that let you build an agent without code usually ask for the same five parts, under other names. The goal and stop rule often go into a box called instructions. Inputs and tools may be called connections, accounts or actions. Approval points may appear as permissions, or as a setting that asks before acting.</p>
<p>The names and options differ between apps, and they change often. Read the help text next to each setting to see which of the five parts it matches.</p>
[/ita_why]

[ita_quiz]
[ita_q q="Which goal is clearest for an agent?" answers="Manage all supply questions, orders and problems for the whole team|Every Friday, list this week's supply requests in one order list|Help the team with supplies whenever it's needed" correct="2" why="It says when the agent runs, what it works on and what done looks like."]
[ita_q q="What does a stop rule tell an agent?" answers="How many tools it is allowed to use|How often the agent should run each week|When the work is finished, and when to give up and ask" correct="3" why="A stop rule covers both the finish line and the point where it should hand a case back to you."]
[ita_q q="Why leave your income out of a comment-sorting agent's inputs?" answers="Numbers confuse AI models, so they make more mistakes|An agent has to read every input you give it, every time|It doesn't need it for this job, so it only adds risk" correct="3" why="Give an agent only what the task needs; extra private details can leak or be misused."]
[/ita_quiz]

<h2>Try it</h2>
<p>Pick one small task that repeats every week, at work or at home. Copy this blank page onto paper and fill in the lines in order. Use plain words, as if you were explaining the job to a new helper.</p>
<ul>
<li>Goal (one sentence, including what "done" means): ____________</li>
<li>Inputs (what it reads, and nothing more): ____________</li>
<li>Tools (mark each one "reads" or "changes"): ____________</li>
<li>Waits for my yes: ____________</li>
<li>Stop when finished: ____________</li>
<li>Give up and ask when: ____________</li>
</ul>
<p>When the page is full, circle every tool that changes what other people see. Check that each one is on the "Waits for my yes" line.</p>
