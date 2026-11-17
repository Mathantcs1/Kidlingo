<?php defined( 'ABSPATH' ) || exit; ?>
<!--ita {"slug":"18-prompting-for-images-and-video","title":"Prompting for images and video","category":"prompting","excerpt":"Describe what a camera would see: subject, setting, framing, light and style. For video, add one action and how the camera moves.","reviewed":"2026-11-16","gated":false,"level":"intermediate","audiences":["creators"],"check":["Image and video generators fill details the prompt leaves out with typical choices.","Text inside generated images can be misspelled or garbled, especially longer text, so titles are often easier to add afterward in an editing app.","In some image generators, mentioning an object in the main description, even with 'no', can make it more likely to appear; some apps offer a separate field for things to leave out.","Many video generators produce short clips, and the maximum length differs between apps.","Generated images can contain errors in details such as hands, the number of objects, or which color belongs to which object.","Many image generators read only the first part of a long description, so details near the end can be lost."]} -->
<p>"A bowl of soup" gets you a bowl of soup, and very little you chose yourself. Now compare: "A steaming bowl of red lentil soup on a wooden table, shot from above. Soft window light from the left, empty space on the right for a title." The second one is much closer to a thumbnail you could use.</p>
<p>Image and video generators fill every detail you leave out with typical choices, the same way chatbots do with text.</p>

<h2>Describe what a camera would see</h2>
<p>A good image [ita_term define="The message or instructions you type to an AI app to tell it what you want."]prompt[/ita_term] reads a bit like a note to a photographer. It covers six things, roughly in the order a viewer notices them:</p>
<ol>
<li><strong>Subject</strong>, with two or three concrete details: "an old blue bicycle with a wicker basket".</li>
<li><strong>Setting</strong>: where it is and what's in the background.</li>
<li><strong>Framing</strong>: close-up, medium or wide, and the angle, such as eye level, from above or from below.</li>
<li><strong>Light</strong>: soft morning light, harsh midday sun, a single lamp at night.</li>
<li><strong>Style</strong>: realistic photo, watercolor, simple cartoon, clay model.</li>
<li><strong>Color and mood</strong>: warm and calm, cold and tense, bright and busy.</li>
</ol>
<p>You can write it as one sentence that fills those slots in order:</p>
[ita_prompt title="One-sentence image description"]
[Subject with two or three details], [what it is doing], in [setting]. [Framing and angle], [light]. [Style], [colors and mood]. Leave empty space on the [left or right] for a title. [Shape: square, tall for phones, or wide] (or set it in the app's settings).
[/ita_prompt]
<p>Describe what you want to see, rather than what you don't. In some generators, writing "no people" can make people more likely to appear, because the word is now in the description. Where an app offers a separate field for things to leave out, use that field. Otherwise describe the empty space: "an empty street at dawn".</p>

<h2>Video adds time</h2>
<p>A video prompt needs everything an image prompt does, plus what changes over time. Many video generators make short clips, and the maximum length differs between apps. Plan one shot per prompt, and join the clips in an editing app.</p>
<p>Within one short clip, use one main action. "A hand pours honey onto pancakes" works. "A hand pours honey, then the camera turns to the window, then a cat jumps up" asks for three shots in one.</p>
[ita_prompt title="One short clip, beat by beat"]
A [length]-second clip, [style].
Start: [what we see in the first moment]
Action: [the one main thing that happens]
End: [what we see in the last moment]
Camera: [still, slow move toward the subject, or slow turn to the left or right]
Sound, if the app makes sound: [for example: quiet kitchen sounds, no music]
[/ita_prompt]
<p>Plain words are a safe start; if your app's guide lists camera terms, use those.</p>

<h2>Problems to plan for</h2>
<p>When a result is close but not right, keep your description and rewrite only the part that's wrong, such as the light. Some problems are common enough to plan for:</p>
<ul>
<li><strong>Text in the image</strong> can come out misspelled or garbled, especially longer text. Many creators leave it out and add the title in an editing app.</li>
<li><strong>Small details</strong> can be wrong: extra fingers, the wrong number of cups, the red scarf on the wrong person. Look closely before you post.</li>
<li><strong>Keeping a character the same</strong> across images is hard from text alone. Check the character in every image before you use them together.</li>
<li><strong>Real people and named artists</strong>: don't ask for a real person's face or a living artist's style by name. Check the app's rules before you use images in paid work.</li>
</ul>
[ita_why title="How image generators read a long description"]
<p>Image generators read your text in small pieces too. Many image generators read only the first part of a long description, so details near the end can be lost.</p>
<p>Details can also get mixed up. Ask for "a red cup and a blue plate" and you may get a blue cup. The generator has learned which words go with which images, but keeping each color attached to the right object is still a weak spot. Shorter descriptions with fewer competing details help.</p>
[/ita_why]

[ita_quiz]
[ita_q q="Your thumbnail looks right, except the light is too harsh. What should you change?" answers="The whole description, written again from the start|Add more adjectives about the subject|Only the light part, keeping the rest the same" correct="3" why="Changing one part at a time shows you what each change does."]
[ita_q q="The title text inside your image comes out misspelled. What's a sensible fix?" answers="Leave text out and add the title in an editing app|Repeat the exact title several times inside the description|Describe the font and its size in more detail" correct="1" why="Generators can garble text, so adding it afterward is more reliable."]
[ita_q q="Why describe one main action for each short video clip?" answers="One action fits the short length and is easier to get right|Video generators ignore everything after the first verb|Several actions always come out as separate clips" correct="1" why="Short clips have room for one clear action; join several clips for a longer scene."]
[/ita_quiz]

<h2>Try it</h2>
<p>Use a photo you took yourself as the target.</p>
<ol>
<li>Pick one of your own photos: a meal, a street, a pet, a view from a window.</li>
<li>Without looking at it again, write it as one sentence using the six parts: subject, setting, framing, light, style, mood.</li>
<li>Generate an image from your sentence, and find the biggest difference from your photo.</li>
<li>Rewrite the part of your sentence that caused it, and save the new sentence as the start of your next thumbnail description.</li>
</ol>
