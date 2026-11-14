// The Effect Controls (clip inspector) topics: one per section, in the order the panel shows them.
import type { HelpTopic } from './helpTypes';

export const CONTROL_TOPICS: HelpTopic[] = [
  {
    id: 'controls-overview',
    title: 'Effect Controls: overview',
    group: 'Effect Controls',
    keywords: 'inspector sidebar right panel sections chevron collapse controls guide',
    blocks: [
      { t: 'p', text: 'Select one clip and the Effect Controls panel on the right shows its settings in groups. Click a group title (the small triangle) to fold or unfold it; ClipForge remembers which groups you closed.' },
      {
        t: 'rows',
        rows: [
          ['Transform', 'Frame mode, position, scale, rotation, opacity and blend mode (video, image, overlay; adjustment layers: opacity and blend).'],
          ['Animation', 'Presets, keyframes, loops, copy and paste of animation.'],
          ['Effects', 'Looks, the effect stack and LUTs (video, image, adjustment layers).'],
          ['Audio', 'Volume, fades, pan and audio effects (clips with sound).'],
          ['Overlay', 'Text, colours and sticker (overlay clips only).'],
        ],
      },
      { t: 'p', text: 'Every committed change is one undo step. On a locked track the controls are disabled. A number field commits on Enter or when you leave it; Up and Down step the value (Shift = ×10) and Esc reverts.' },
    ],
  },
  {
    id: 'controls-transform',
    title: 'Transform',
    group: 'Effect Controls',
    keywords: 'frame fit fill blur position x y scale rotation opacity reset blend',
    blocks: [
      {
        t: 'rows',
        rows: [
          ['Frame: Fit', 'Show the whole picture (black bars if the shape differs).'],
          ['Frame: Fill', 'Fill the frame and crop the edges.'],
          ['Frame: Blur', 'Show the whole picture over a blurred copy of itself. Choosing a mode resets position and scale to that mode.'],
          ['X, Y', 'Position in pixels from the frame centre (0 = centred; y grows downward).'],
          ['Scale', 'Size in percent.'],
          ['Rotation', 'Degrees, clockwise.'],
          ['Opacity', '0 to 100 percent.'],
          ['Reset', "Put the clip back where its frame mode places it."],
          ['Blend', 'How the clip mixes with the layers below it (12 modes).'],
        ],
      },
      { t: 'p', text: 'Below the fields, each of Position, Scale, Rotation and Opacity has a keyframe row: see Animation and keyframes. "Orient along path" turns the picture to face the way it moves along its position path.' },
    ],
  },
  {
    id: 'controls-animation',
    title: 'Animation and keyframes',
    group: 'Effect Controls',
    keywords: 'presets keyframes diamond stopwatch ease spring loop repeat ping-pong continue path orient curve copy paste slot',
    blocks: [
      { t: 'p', text: 'Keyframes: each property has a stopwatch (switch animation on or off), previous and next key arrows, a diamond (add a key at the playhead holding the value shown, or remove the key there) and a small strip of its keys. While a property is animated, typing a value, or dragging the clip on the preview, writes a key at the playhead. The playhead must be on the clip.' },
      {
        t: 'rows',
        rows: [
          ['∿ button', 'Open the ease editor for the key at the playhead: Linear, Hold, Ease in/out, Back, Elastic, Bounce, a cubic-Bezier curve you drag, or a Spring (Gentle, Snappy, Bouncy, Wobbly or your own stiffness, damping and mass).'],
          ['Loop list', 'After the last key: No loop, Repeat, Ping-pong or Continue (keep adding each cycle\'s change), with an optional cycle count.'],
          ['Preset slots', 'In, Emphasis, Loop and Out: one preset each. Choose (or Change) opens the preset browser with animated previews; ✕ removes it. Each preset has duration, delay, ease and its own parameters.'],
          ['Preset browser', 'Tabs for categories, My presets and Favourites; type to search by name.'],
          ['Copy keys / Paste keys', 'Copy the keyframes selected on the timeline; paste at the playhead.'],
          ['Copy animation / Paste animation', "Replace a clip's whole animation with another's."],
          ['Save as preset…', 'Store this clip\'s animation in your personal library (kept in this browser, not in the project).'],
        ],
      },
      { t: 'p', text: 'Presets are a layer on top of the clip\'s own values, so they combine with keyframes. A faint outline on the preview shows where a preset draws the picture. Selected animated clips show diamonds on the timeline: click to select, Shift-click for several, drag to retime, Delete to remove.' },
    ],
  },
  {
    id: 'controls-effects',
    title: 'Effects, looks and LUTs',
    group: 'Effect Controls',
    keywords: 'colour blur sharpen glow pixelate chroma key vignette grain lut cube blend look',
    blocks: [
      {
        t: 'rows',
        rows: [
          ['Looks', 'One click replaces the whole effect stack with a look (Black & White, Sepia, Vintage Film, Teal & Orange, and more). Undo brings the old stack back.'],
          ['Add effect + Add', 'Choose an effect from the list and press Add (or Enter). Up to 8 per clip.'],
          ['The stack', 'Effects run from top to bottom: each works on the result of the one above. Each row can be switched on or off, reordered, edited or removed; numeric parameters can be keyframed.'],
          ['LUTs', 'Import a .cube file, then Use adds it as an effect; × removes an unused LUT from the project.'],
        ],
      },
    ],
  },
  {
    id: 'controls-audio',
    title: 'Audio',
    group: 'Effect Controls',
    keywords: 'volume fade pan normalise effects preset detach attach',
    blocks: [
      {
        t: 'rows',
        rows: [
          ['Volume', '0 to 200 percent; 0 mutes. Committed when you release the slider.'],
          ['Fade in / Fade out', 'Seconds.'],
          ['Pan', '-100 (full left) to +100 (full right); the label shows L, C or R.'],
          ['Audio effects', 'EQ, high-pass, low-pass, compressor, reverb, echo, gain, pitch shift and noise reduction, applied in list order.'],
          ['Preset…', 'Podcast voice, Radio, Telephone, Deep voice, Chipmunk: replaces the effect chain.'],
          ['Normalise', "Adds a gain effect so the clip's loudest source peak reaches about -1 dBFS."],
          ['Attach back', 'Shown after Detach audio: removes the detached audio clip and makes the video play its own sound again.'],
        ],
      },
    ],
  },
  {
    id: 'controls-overlay',
    title: 'Overlays and adjustment layers',
    group: 'Effect Controls',
    keywords: 'lower third subscribe progress bar sticker adjustment layer text colour',
    blocks: [
      { t: 'p', text: 'Add overlay places a lower third, subscribe button, progress bar, sticker or adjustment layer at the playhead as a clip on a video layer.' },
      {
        t: 'list',
        items: [
          'Overlays have text (title, subtitle or button text), two colours and, for stickers, a picture. They also have position, scale, rotation, opacity and animation like any clip, but no sound, fit, blend or effects.',
          'An adjustment layer applies its effect stack, opacity and blend mode to everything on the layers beneath it during its time range. Hide its track to switch it off.',
        ],
      },
    ],
  },
];
