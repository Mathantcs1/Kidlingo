<?php defined( 'ABSPATH' ) || exit; ?>
<!--ita {"slug":"02-ml-vs-deep-learning-vs-generative-ai","title":"ML vs deep learning vs generative AI","category":"ai-basics","excerpt":"Machine learning, deep learning and generative AI fit inside each other like nested boxes. What each term covers, and how they differ.","reviewed":"2026-11-16","gated":false,"level":"intermediate","audiences":["students","builders"],"check":["Deep learning is a kind of machine learning, and most generative AI in use today is built with deep learning, so the three terms describe nested groups; people also use them loosely or interchangeably.","Machine learning systems learn patterns from examples instead of following only rules a person wrote by hand.","Deep learning uses neural networks with many layers, and it usually needs much more data and computing power than simpler machine learning methods.","Simpler machine learning methods, such as decision trees, are still widely used for tasks like scoring, ranking and forecasting from tables of data.","Many image generators learn to turn random noise into a picture step by step.","Chatbots run on language models, which write by predicting the next piece of text (a token) again and again."]} -->
<p>Machine learning is the big box. Deep learning is a smaller box inside it, and generative AI mostly sits inside deep learning. Each term is a narrower slice of the one before it.</p>
<p>The labels get mixed up in news stories and job ads. Knowing which box a system is in helps you guess what it needs, what it does well and how it tends to fail.</p>

<h2>Three nested boxes</h2>
<h3>Machine learning: learning from examples</h3>
<p>[ita_term define="A way of building software where the program learns patterns from examples instead of following only rules a person wrote by hand."]Machine learning[/ita_term] (ML) is the broad idea. You don't write every rule yourself. You give the program many examples, and it adjusts itself until its guesses match them well.</p>
<p>Say you want to predict whether a library book will come back late. You could write rules by hand. Or you could give a program thousands of past loans. Each one has details like the due date and the borrower's history, plus whether it came back late. The program finds the patterns. Many methods can do this, and some are simple enough to explain on one page.</p>

<h3>Deep learning: many layers</h3>
<p>[ita_term define="A kind of machine learning that uses neural networks with many layers stacked on top of each other."]Deep learning[/ita_term] is one family of ML methods. It uses a [ita_term define="A model made of many simple connected units that pass numbers to each other and adjust their connections during training."]neural network[/ita_term] with many layers.</p>
<p>Deep learning works best on photos, sound and long text, where it's hard to write down by hand which details to look for. Roughly speaking, a deep network can learn that certain shapes of pixels mean "edge", then "eye", then "face". The cost is that it usually needs far more data and computing power than simpler methods.</p>

<h3>Generative AI: making new content</h3>
<p>[ita_term define="AI that produces new content, such as text, images, audio or code, instead of only sorting or scoring existing data."]Generative AI[/ita_term] is about output. Most ML predicts a label or a number: spam or not, late or on time. A generative model produces something new, like a paragraph, a picture or a short melody.</p>
<p>Today's generative systems are almost all built with deep learning. Chatbots run on a [ita_term define="A program trained on a very large amount of text to predict which piece of text is likely to come next."]language model[/ita_term], which writes by predicting the next piece of text (a token), again and again. Many image generators learn to turn random noise into a picture, step by step.</p>

<h2>Side by side</h2>
<ul>
<li><strong>Typical job.</strong> Classic ML sorts, scores or forecasts. Deep learning recognizes patterns in images, sound or text. Generative AI produces new text, images or audio.</li>
<li><strong>Typical input.</strong> Classic ML is a common choice for tables, like rows in a spreadsheet. Deep learning takes raw media and long text. Generative models take a [ita_term define="The message or instructions you type to an AI app to tell it what you want."]prompt[/ita_term] and are trained on very large collections of examples.</li>
<li><strong>Data and computing needs.</strong> Classic ML can work with modest data on an ordinary laptop. Deep learning usually needs much more of both. Training a large generative model needs far more than either.</li>
<li><strong>How it tends to go wrong.</strong> All three can be thrown off by data unlike what they trained on. Deep learning is also hard to explain. Generative models can produce fluent output that is simply false.</li>
</ul>
[ita_why title="Why is deep learning harder to explain?"]
<p>A single small <strong>decision tree</strong> makes its choice through a few readable questions: "Has this borrower returned books late before? Is the loan longer than two weeks?" You can follow the path.</p>
<p>A deep network spreads what it learned across a huge number of numeric [ita_term define="The adjustable numbers inside a model that change during training and decide how it turns input into output."]parameters[/ita_term]. No single number means "late borrower". Researchers have methods to probe what a network pays attention to. This area is called interpretability, and it is still being worked on.</p>
[/ita_why]

<h2>Picking the right word, and the right method</h2>
<p>When you read or write about a system, ask what it outputs and how it was built. A few common cases:</p>
<ul>
<li>A photo app that finds faces is almost certainly deep learning. It isn't generative, because it labels pictures instead of making new ones.</li>
<li>A chatbot is generative AI, built with deep learning, which is a kind of ML. All three labels are true at once.</li>
</ul>
<p>Builders face a practical version of the same question. For a small table of numbers, a simpler method is often faster to train, cheaper to run and easier to explain. So start from the job you need done, then pick the method.</p>
<p>Take a few thousand support tickets, each labeled "urgent" or "not urgent". A simple classifier trained on those labels may be enough. A generative model could also sort them, and it can write a reply draft too, but it costs more to run on every ticket. You can ask a chatbot to help you weigh the options:</p>
[ita_prompt title="Choose a method for a data task"]
I have about 3,000 customer support tickets in a CSV file with two columns: text, label.
The label is either "urgent" or "not_urgent".
Example row: "App crashes every time I open my invoice", urgent
Goal: label new tickets automatically as they arrive.
Compare three options: a simple classifier, a small deep learning model, and a general chatbot model.
For each one, give the data it needs, the running cost in plain words, and how easy its decisions are to explain.
Then recommend one to try first.
[/ita_prompt]

[ita_quiz]
[ita_q q="How do machine learning, deep learning and generative AI relate?" answers="They are three separate technologies that compete for the same jobs|Deep learning is a kind of ML, and most generative AI is built with deep learning|Generative AI is the broadest term, and ML is one small part of it" correct="2" why="The terms are nested: ML is the broad idea, deep learning is one family inside it, and most generative systems use deep learning."]
[ita_q q="A shop wants to forecast next month's sales from a spreadsheet of past sales. What is a sensible first try?" answers="A simpler ML method, because the data is a modest table|A large generative model, because it is the newest option|A deep network, because the data has a time order|Rules written by hand, because forecasting needs no learning" correct="1" why="For modest table data, simpler ML methods are often quicker, cheaper and easier to explain."]
[ita_q q="Which failure is most typical of generative models?" answers="Giving exactly the same output every time|Only working on numbers in tables|Fluent output that is simply false" correct="3" why="Generative models can produce confident, well-written content that is wrong, so the output needs checking."]
[/ita_quiz]

<h2>Try it</h2>
<p>Sort the AI you already use on paper.</p>
<ol>
<li>Draw three nested boxes and label them ML, deep learning and generative AI.</li>
<li>Write four things you used this week that might involve AI. A spam filter, a map's travel time, a photo search and a chatbot all count.</li>
<li>Next to each one, write its output: a label, a number or new content.</li>
<li>Place each item in the smallest box that fits. Put a question mark on any you can't place.</li>
<li>For each question mark, write down the one fact about how it was built that you would need.</li>
</ol>
