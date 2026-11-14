import type { HelpTopic } from './helpTypes';

export const MORE_TOPICS: HelpTopic[] = [
  {
    id: 'copy-paste',
    title: 'Copy, paste and duplicate',
    group: 'Editing',
    keywords: 'clipboard presets personal library',
    blocks: [
      {
        t: 'list',
        items: [
          'Ctrl/Cmd+C copies the selected keyframes or, with none selected, the selected clips. Ctrl/Cmd+V pastes what was copied last; paste again for more copies.',
          'Pasted clips land at the playhead on the active track (from a lane\'s right-click menu: at the clicked time on that track). An overlap is refused with a message.',
          'Ctrl/Cmd+D duplicates the selected clips right after them.',
          'Ctrl/Cmd+Alt+C and V copy and paste a whole animation. Text fields keep their own copy and paste.',
        ],
      },
    ],
  },
  {
    id: 'tips',
    title: 'Tips for editing',
    group: 'Editing',
    keywords: 'right-click drag snapping tips context menu',
    blocks: [
      {
        t: 'list',
        items: [
          'Right-click a clip for Copy, Paste, Duplicate, Split, Delete, Ripple delete, Detach audio, Merge (two or more selected), animation copy and paste, Save as preset and Reset transform. Right-clicking an unselected clip selects it first.',
          'Right-click an empty spot of a lane to paste there or add a track; right-click a track header for Mute, Solo, Lock, Hide, Move and Delete track.',
          'Dragging a clip or its edge snaps to other clips and to 0; hold Alt (Option on a Mac) to turn snapping off.',
          'Drag a clip onto the strip above the top video layer (or below the bottom audio track) to put it on a new layer.',
          'Text fields keep the browser\'s own right-click menu and clipboard.',
        ],
      },
    ],
  },
  {
    id: 'recording',
    title: 'Voice-over recording',
    group: 'Editing',
    keywords: 'record microphone voice',
    blocks: [
      { t: 'p', text: 'Record starts at the playhead and Stop adds the take as audio named "Voice-over N" on the active audio track (one undo step). The browser asks for microphone permission the first time. A take stops by itself after 30 minutes. Export and Merge all wait until recording stops.' },
    ],
  },
  {
    id: 'export',
    title: 'Export',
    group: 'Editing',
    keywords: 'mp4 1080p 4k render format',
    blocks: [
      { t: 'p', text: 'Export renders the timeline to an MP4 (H.264 video, AAC audio) at 1080p or 4K with a progress bar, Cancel and a file name you choose. Hidden layers and muted tracks are left out, exactly as in the preview. The Format list at the top sets the shape: YouTube 16:9, Vertical 9:16, Square 1:1 or Portrait 4:5. Exporting does not change the project.' },
    ],
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    group: 'Reference',
    keywords: 'keys hotkeys ctrl cmd mac windows',
    blocks: [{ t: 'shortcuts' }],
  },
  {
    id: 'about',
    title: 'About ClipForge',
    group: 'Reference',
    keywords: 'licenses browser support privacy',
    blocks: [
      { t: 'p', text: 'ClipForge runs entirely in your browser: decoding, rendering and encoding happen on your machine and your media never leaves it. Projects and media are stored in this browser.' },
      { t: 'p', text: 'It is tested in desktop Chrome. Other browsers are untested; it needs WebCodecs, WebGL2, Web Audio and writable Origin Private File System support, and a banner names whatever is missing. See the README for details.' },
      { t: 'p', text: 'Open Help, then "About ClipForge / Third-party licenses" for the licences of the libraries used.' },
    ],
  },
];
