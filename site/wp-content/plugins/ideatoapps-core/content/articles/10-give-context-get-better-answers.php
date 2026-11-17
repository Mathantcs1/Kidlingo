<?php defined( 'ABSPATH' ) || exit; ?>
<!--ita {"slug":"10-give-context-get-better-answers","title":"Give context, get better answers","category":"prompting","excerpt":"A chatbot can't see your situation. One worked example shows which details to add, and how to let the chatbot ask for what it's missing.","reviewed":"2026-11-16","gated":false,"level":"beginner","audiences":["beginners","workers-and-business-owners"],"check":["A chatbot only knows about your situation what is in the conversation, plus anything the app adds, such as saved memory or shared files.","Without context, a chatbot tends to fill gaps with typical choices, which makes answers generic.","Asking a chatbot to ask you questions before it answers is a common way to find missing context.","Every model can only take a limited amount of text into account at once; depending on the app, the oldest messages in a long chat can be dropped or summarized, so the model may lose track of them.","Pasting a short example of the style you want usually helps a chatbot match that style."]} -->
<p>Imagine you run a small bakery, and next month you'll close on Mondays. You ask a chatbot for a sign to tell customers. The result is fine, but it could be for any shop anywhere. Nothing in it sounds like you.</p>
<p>The fix is context: the details only you know.</p>

<h2>Before: the request with no background</h2>
<p>This is the kind of [ita_term define="The message or instructions you type to an AI app to tell it what you want."]prompt[/ita_term] most people type first:</p>
[ita_prompt title="Before"]
Write a notice saying we are closed on Mondays.
[/ita_prompt]
<p>The chatbot has to guess almost everything. It doesn't know it's a bakery, when the change starts, why it's happening, or who reads the sign. You'd likely get something polite and stiff, maybe with "We apologize for any inconvenience", and nothing about your regulars or your bread.</p>
<p>It only knows about your situation what's in the conversation, plus anything the app adds, like saved memory or a file you shared. It can't see your shop.</p>

<h2>After: the same request with context</h2>
<p>Now add the details a new employee would need before writing that sign for you:</p>
[ita_prompt title="After"]
Write a short notice for the front door of my small neighborhood bakery.
From [start date], we will be closed on Mondays so the team gets a regular day off.
Tuesday to Sunday hours stay the same.
Most customers are regulars who buy bread on their way to work, and some of them come on Mondays.
Tone: warm and a little playful. Here is a line from our last notice, to show our style: "Fresh rolls, warm hellos, see you tomorrow!"
Mention that Sunday is a good day to stock up, and thank people for understanding.
Keep it under 60 words so it fits on one sheet in large print.
[/ita_prompt]
<p>Every line removes a guess. The chatbot now knows the audience, the reason, the start date, the tone and the size. The draft is much more likely to sound like your bakery and to answer the questions customers will ask.</p>
<p>Most useful details are one of these:</p>
<ul>
<li><strong>Who it's for</strong> and what they already know.</li>
<li><strong>The situation</strong>: what happened, what's changing, any deadlines.</li>
<li><strong>What you've tried</strong>, so you don't get the same idea back.</li>
<li><strong>Your style</strong>, shown with a short example of your own writing.</li>
<li><strong>Limits</strong>, like length, where it will be used, or words to avoid.</li>
</ul>
<p>You don't need all of them each time. Add the ones that would change the answer.</p>
[ita_why title="Why does a short example of your writing help so much?"]
<p>Words like "warm" or "playful" mean different things to different people. A real line of your writing shows the chatbot your sentence length, your word choices and your sense of humor all at once.</p>
<p>The model writes by predicting likely text, and text that sits in the conversation strongly shapes those predictions. One short example is often enough. A long one can lead the chatbot to copy whole phrases, so pick a line or two.</p>
[/ita_why]

<h2>Let the chatbot ask you first</h2>
<p>Sometimes you don't know which details matter. One simple fix is to ask the chatbot to interview you before it writes anything.</p>
[ita_prompt title="Ask me first"]
I need help writing [what you need, for example: a notice for my bakery about new opening days].
Before you write anything, ask me up to five short questions about the details you need.
Wait for my answers, then write it.
[/ita_prompt]
<p>Its questions show you what it would otherwise have guessed. Answer them briefly, and the right context is in the chat without you having to think of it all first.</p>
<h3>In a long chat, repeat what matters</h3>
<p>Context you gave early does not always stay in view. A model can only take a limited amount of text into account at once, called the [ita_term define="The amount of text, counted in small pieces called tokens, that a model can take into account at one time."]context window[/ita_term]. Depending on the app, the oldest messages in a long chat can be dropped or summarized, so the model may lose track of them.</p>
[ita_figure name="context-window" alt="Two bars: early in a chat the space is mostly empty; late in a long chat it is full, and the oldest messages are cut off." caption="The oldest messages fall out first. 'Rules' are the app's own instructions."]
<p>If the chatbot starts ignoring a detail you gave at the start, repeat it in a new message. For a fresh chat, begin with a two-line summary of what matters.</p>

[ita_quiz]
[ita_q q="Why add what you've already tried to your request?" answers="It makes the answer longer and more detailed|So you don't get the same idea back|It lets the chatbot search your past chats" correct="2" why="If the chatbot knows what didn't work, it can suggest something new."]
[ita_q q="You want a notice in your shop's usual style. What helps the chatbot most?" answers="Telling it to sound more like a real shop|Pasting one short line of your past writing|Writing the word 'style' in capital letters" correct="2" why="A real example shows sentence length, word choice and humor better than a description."]
[ita_q q="You don't know which details the chatbot needs. What can you do?" answers="Repeat the same short request several times|Add the word 'detailed' to the end|Ask it to ask you a few questions first" correct="3" why="The chatbot's questions show the gaps it would otherwise have to guess."]
[/ita_quiz]

<h2>Try it</h2>
<p>Make a reusable context list from one real task.</p>
<ol>
<li>Pick something you need to write this week, like a message to a customer, a school or a local group.</li>
<li>Copy the "Ask me first" prompt and fill in the part in square brackets.</li>
<li>Answer the chatbot's questions in a few words each.</li>
<li>Copy its questions into a note titled "Context to give", and delete any that don't fit your usual tasks.</li>
<li>Next time you write something similar, answer that list in your first message.</li>
</ol>
