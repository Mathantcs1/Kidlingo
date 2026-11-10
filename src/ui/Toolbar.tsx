import { timelineDuration } from '../core/timeline';
import { useEditor } from '../state/store';
import { deleteSelected, mergeSelected, redo, rippleDeleteSelected, splitAtPlayhead, togglePlay, undo } from './commands';
import { videoClipCount } from './edits';
import { openExport, startMerge } from './exportJob';
import { formatTimecode } from './layout';
import { usePlaybackStatus } from './usePlayback';

export default function Toolbar({ editable, inert }: { editable: boolean; inert: boolean }) {
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  const playing = useEditor((s) => s.playing);
  const playhead = useEditor((s) => s.playhead);
  const selected = useEditor((s) => s.selection.length);
  const hasContent = useEditor((s) => timelineDuration(s.history.present) > 0);
  const canMergeAll = useEditor((s) => videoClipCount(s.history.present) >= 2);
  const buffering = usePlaybackStatus((s) => s.buffering);
  const saveError = useEditor((s) => s.saveError);

  return (
    <div className="toolbar" role="toolbar" aria-label="Editing tools" inert={inert}>
      <div className="toolbar-group">
        <button type="button" data-testid="btn-undo" onClick={undo} disabled={!editable || !canUndo} title="Undo (Ctrl/Cmd+Z)">
          Undo
        </button>
        <button
          type="button"
          data-testid="btn-redo"
          onClick={redo}
          disabled={!editable || !canRedo}
          title="Redo (Shift+Ctrl/Cmd+Z)"
        >
          Redo
        </button>
      </div>
      <div className="toolbar-group">
        <button
          type="button"
          data-testid="btn-play"
          className="btn-play"
          onClick={togglePlay}
          disabled={inert}
          aria-pressed={playing}
          aria-busy={buffering}
          title="Play/Pause (Space)"
        >
          {buffering ? 'Loading…' : playing ? 'Pause' : 'Play'}
        </button>
        <span className="timecode" aria-label="Playhead position">
          {formatTimecode(playhead)}
        </span>
      </div>
      <div className="toolbar-group">
        <button
          type="button"
          data-testid="btn-split"
          onClick={splitAtPlayhead}
          disabled={!editable}
          title="Split at playhead (S)"
        >
          Split
        </button>
        <button
          type="button"
          data-testid="btn-delete"
          onClick={deleteSelected}
          disabled={!editable || selected === 0}
          title="Delete selected clips (Delete)"
        >
          Delete
        </button>
        <button
          type="button"
          data-testid="btn-ripple-delete"
          onClick={rippleDeleteSelected}
          disabled={!editable || selected === 0}
          title="Delete the selected clips and close the gaps (Shift+Delete)"
        >
          Ripple delete
        </button>
        <button
          type="button"
          data-testid="btn-merge"
          onClick={mergeSelected}
          disabled={!editable || selected < 2}
          title="Join the selected clips"
        >
          Merge
        </button>
        <button
          type="button"
          data-testid="btn-merge-all"
          onClick={() => void startMerge()}
          disabled={!editable || !canMergeAll}
          title="Render the whole timeline into a single clip"
        >
          Merge all into one clip
        </button>
      </div>
      <div className="toolbar-group toolbar-end">
        {saveError !== null && (
          <span className="save-status" role="status" data-testid="save-status" title={saveError}>
            Not saved
          </span>
        )}
        <button
          type="button"
          data-testid="btn-export"
          className="btn-primary"
          disabled={!editable || !hasContent}
          onClick={openExport}
          title="Export the timeline as an MP4"
        >
          Export
        </button>
      </div>
    </div>
  );
}
