<?php defined( 'ABSPATH' ) || exit; ?>
<!--ita {"slug":"46-bias-in-ai","title":"Bias in AI","category":"safety-and-judgment","excerpt":"How bias gets into AI models, a simple test that changes one detail between two requests, and a classroom activity built on it.","reviewed":"2026-11-16","gated":false,"level":"intermediate","audiences":["students","teachers-and-tutors"],"check":["AI models learn patterns from training data made by people, so unequal patterns in that data can appear in the model's output.","Some languages, regions and groups appear much less than others in typical training data, which can make answers about them less accurate or more stereotyped.","People's ratings during training shape what a model learns, and their preferences can add or reduce bias.","Developers add rules and training to reduce biased output, but these measures are incomplete and can overcorrect; how to measure bias in models is still debated.","Removing a sensitive detail such as gender from data does not remove bias by itself, because other details, such as hobbies, schools or postcodes, can carry the same information.","Chatbot answers vary from run to run, so a fair comparison sends each version of a request several times, in temporary chats or with memory turned off."]} -->
<p>It's easy to assume a computer program can't take sides, because it only does math. But a model learns from text and images that people made, and it can repeat the unequal patterns in them. That repeated pattern is what people usually mean by [ita_term define="A pattern in a system's output that treats some groups of people unfairly, or always describes them the same way."]bias[/ita_term] in AI.</p>

<h2>How bias gets in</h2>
<p>Bias can enter at several points between the data and the answer you read:</p>
<ul>
<li>The data. Training text and images come mostly from what's online, and some languages, regions and groups appear far less than others.</li>
<li>The labels. People describe and sort training data, and their assumptions can end up in those labels.</li>
<li>Training choices. People rate answers during training, and their preferences shape what the model learns (see "How LLMs are trained").</li>
<li>The use. An app built for one job may be used for another, on people its data barely included.</li>
</ul>
<p>A writing helper might mark a regional dialect or a learner's phrasing as wrong more often than standard school English. It can do this even when the meaning is clear. If you've ever had a spell checker underline your own name, you've seen a small, harmless version of the same thing.</p>
<p>Developers add rules and training to reduce biased output. These help, but they don't catch everything, and sometimes they overcorrect. How much bias a given model has, and how best to measure it, is still debated.</p>
[ita_why title="Why removing a label doesn't remove bias"]
<p>An obvious fix is to delete the sensitive detail: no gender, no age, no ethnicity. It often isn't enough, because other details can carry the same information. A postcode can hint at income or background. Hobbies, school names and even writing style can hint at gender or age.</p>
<p>Picture a job-application sorter trained on a company's past hiring decisions. If those decisions favored one group, the sorter can learn the same preference through these other details, without anyone telling it to. So a bias check compares the results for different groups as well as the columns in the data.</p>
[/ita_why]

<h2>Two requests, one detail changed</h2>
<p>Students can test a chatbot for bias with a simple comparison. Write a request, then send it again with exactly one detail changed. Everything else stays word for word the same. This [ita_term define="The message or instructions you type to an AI app to tell it what you want."]prompt[/ita_term] changes only the person in the brackets:</p>
[ita_prompt title="One detail changed"]
Suggest five possible careers for [a 16-year-old girl] who loves math and wants to work outdoors.
For each career, write one sentence on what the work involves.
[/ita_prompt]

<p>Send it in a temporary chat, or with memory turned off, so earlier chats can't affect it. Then send it again the same way with "a 16-year-old boy" in the brackets. Answers vary from run to run anyway, so send each version three times before you compare. Then read the lists side by side. Check whether the jobs, their level or the tone differ in the same way every time. A difference that repeats points to the one detail you changed.</p>
<p>You can also change a name, an age, a hometown or a disability instead. Keep the details invented, and never use a real classmate's name or photo.</p>

<h2>In the classroom</h2>
<p>A teacher can turn the test into a lesson, using an app the school allows for students. Give each group a different detail to change, and have every group run its two versions three times each. Groups record the differences in a shared table, then the class discusses which differences repeat and which look like normal variation.</p>
<p>A good closing question is "Who would be affected if an app like this were used to give real advice?" It turns the discussion to the people the advice would reach.</p>
<p>Teachers can also apply the lesson to their own work. An AI app shouldn't be the only judge of a student's essay, grade or behavior. If your school uses AI apps for feedback, ask how they were tested with different groups of students.</p>

[ita_quiz]
[ita_q q="A job-application sorter never sees applicants' gender. How could it still treat men and women differently?" answers="It can't, once the gender column is removed|It treats them the same, but people read the results unfairly|Other details, such as hobbies or past schools, can carry the same information" correct="3" why="Details that go along with gender can act as a stand-in for it."]
[ita_q q="You send a request three times with 'girl' and three times with 'boy', and the lists differ the same way each time. What does that most likely show?" answers="A pattern linked to the one detail you changed|Normal run-to-run randomness in the answers|The app saved the first answer and reused it" correct="1" why="Randomness changes answers in different ways each time, while a difference that repeats follows the changed detail."]
[ita_q q="Your class thinks a chatbot gives harsher essay feedback to one group of writers. What is a fair test?" answers="Ask the chatbot whether it treats the two groups differently|Compare feedback on different essays written by students in each group|Send the same essay several times in new chats, changing one detail" correct="3" why="Using the same essay means the changed detail is the only difference between the versions."]
[/ita_quiz]

<h2>Try it</h2>
<p>Do this on paper with a classmate, a study group or a class.</p>
<ol>
<li>Each person writes a one-line description of "a scientist", "a nurse" and "a farmer", taking about thirty seconds for each.</li>
<li>Swap pages and circle every detail the word itself didn't say, such as age, gender or country.</li>
<li>Find the circled detail that came up most often in the group.</li>
<li>Write one chatbot request that states that detail yourself, so the model doesn't fill it in with a default.</li>
</ol>
