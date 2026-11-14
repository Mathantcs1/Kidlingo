// The guide's topics (see helpTypes). Everything here describes controls that exist; the README is the reference for
// supported browsers and formats. Split across helpContent*.ts to keep each file small.
import type { HelpTopic } from './helpTypes';
import { CONTROL_TOPICS } from './helpContentControls';
import { MORE_TOPICS } from './helpContentMore';

const BASICS: HelpTopic[] = [
  {
    id: 'quick-start',
    title: 'Quick start',
    group: 'Getting started',
    keywords: 'begin first import add timeline trim split export tutorial',
    blocks: [
      { t: 'p', text: 'ClipForge edits video entirely in your browser: nothing is uploaded, and your project is saved automatically in this browser.' },
      {
        t: 'steps',
        items: [
          'Import: press Import in the Media panel (or drop files on it). Video, audio and images work; a file imports only if your browser can decode it.',
          'Add to the timeline: press the + button on a media item (it goes to the end of the active track) or drag the item onto a track.',
          'Trim: drag the left or right edge of a clip. Move: drag its body. Both snap to other clips and to 0 (hold Alt or Option to switch snapping off).',
          'Split: put the playhead where you want the cut (click the ruler), select the clip and press S or the Split button.',
          'Check the result in the Program panel and press Space to play.',
          'Export: press Export (top right) to render an MP4 at 1080p or 4K.',
        ],
      },
      { t: 'p', text: 'Every edit can be undone with Ctrl/Cmd+Z. Right-click clips, tracks and media for a menu of actions.' },
    ],
  },
  {
    id: 'media-bin',
    title: 'Media panel',
    group: 'The panels',
    keywords: 'import bin files lut remove',
    blocks: [
      {
        t: 'rows',
        rows: [
          ['Import', 'Choose files, or drop them on the panel. Video, audio, images and .cube LUT files are accepted.'],
          ['+ (Add to timeline)', 'Appends the media to the end of the active track of its kind.'],
          ['× (Remove)', 'Removes the item from the project. If clips use it you are asked first and they are removed too, as one undo step.'],
          ['Right-click an item', 'Add to timeline, Remove from project.'],
        ],
      },
      { t: 'p', text: 'A badge shows when a video or audio file has sound. Items whose file is no longer in browser storage are marked Missing.' },
    ],
  },
  {
    id: 'preview',
    title: 'Program (preview) panel',
    group: 'The panels',
    keywords: 'canvas handles scale rotate move picture in picture transform',
    blocks: [
      { t: 'p', text: 'The Program panel shows the frame under the playhead. With one video, image or overlay clip selected you can edit it right on the picture.' },
      {
        t: 'rows',
        rows: [
          ['Drag inside the outline', 'Move the clip; it snaps to the frame centre and edges.'],
          ['Drag a corner', 'Scale the clip about its centre.'],
          ['Drag the round handle above it', 'Rotate; hold Shift to snap to 15° steps.'],
          ['Alt / Option', 'Switch snapping off while dragging.'],
          ['Esc during a drag', 'Cancel the drag. Each finished drag is one undo step.'],
          ['Motion path', 'A clip with position keyframes shows its path: drag the dots and tangent handles to shape it.'],
        ],
      },
    ],
  },
  {
    id: 'timeline',
    title: 'Timeline and tracks',
    group: 'The panels',
    keywords: 'tracks mute solo lock hide duck snapping zoom ruler layer',
    blocks: [
      { t: 'p', text: 'Video layers stack (higher layers are drawn on top); audio tracks sit below. Up to 8 of each. + Video layer and + Audio track add tracks; dropping or dragging a clip onto the strip above or below makes a new one.' },
      {
        t: 'rows',
        rows: [
          ['Track name', 'Double-click (or F2 / Enter when focused) to rename.'],
          ['M', 'Mute the track. Mute wins over solo.'],
          ['S', 'Solo: while any track is soloed only soloed tracks are heard.'],
          ['Lock', 'A locked track refuses every edit.'],
          ['Eye', 'Hide a video layer from the preview and the export.'],
          ['D', 'Auto-duck: this audio track dips under the clips of another audio track (amount, attack and release are set in the panel it opens).'],
          ['Slider', 'Track volume.'],
          ['Arrows and ×', 'Move a layer up or down; remove the track (asked first if it has clips).'],
          ['− / + px/s', 'Zoom the timeline out and in.'],
          ['Click the ruler', 'Move the playhead.'],
        ],
      },
      { t: 'p', text: 'Clicking a clip selects it; Shift-, Ctrl- or Cmd-click selects several. Clicking an empty spot of a lane clears the selection and makes that track active.' },
    ],
  },
  {
    id: 'toolbar',
    title: 'Toolbar buttons',
    group: 'The panels',
    keywords: 'undo redo play split delete ripple detach merge copy paste duplicate record overlay export new project',
    blocks: [
      {
        t: 'rows',
        rows: [
          ['New project', 'Start an empty project (asks first if the current one has content).'],
          ['Undo / Redo', 'Step back or forward through every edit.'],
          ['Play / Pause', 'Plays the timeline with sound; the time next to it is the playhead.'],
          ['Split', 'Cut the selected clips at the playhead.'],
          ['Delete', 'Delete the selected clips.'],
          ['Ripple delete', 'Delete the selected clips and close the gaps.'],
          ['Detach audio', "Move a video clip's sound onto its own audio clip."],
          ['Merge', 'Join the selected clips back to back (needs two or more).'],
          ['Merge all into one clip', 'Render the whole timeline into one new video that replaces it (one undo step).'],
          ['Copy / Paste / Duplicate', 'Copy the selected clips, paste them at the playhead on the active track, or duplicate them right after.'],
          ['Record', 'Record a voice-over from the microphone, starting at the playhead; press again to stop. Cancel or Esc discards the take.'],
          ['Play along', 'Plays the timeline while recording. Use headphones.'],
          ['Add overlay', 'Add a lower third, subscribe button, progress bar, sticker or adjustment layer at the playhead.'],
          ['Export', 'Open the export dialog.'],
        ],
      },
    ],
  },
];

export const HELP_TOPICS: HelpTopic[] = [...BASICS, ...CONTROL_TOPICS, ...MORE_TOPICS];
