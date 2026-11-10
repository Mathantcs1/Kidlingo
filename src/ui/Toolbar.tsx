import { useEditor } from '../state/store';
import { deleteSelected, mergeSelected, redo, splitAtPlayhead, togglePlay, undo } from './commands';
import { formatTime } from './layout';

export default function Toolbar({ editable }: { editable: boolean }) {
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  const playing = useEditor((s) => s.playing);
  const playhead = useEditor((s) => s.playhead);
  const selected = useEditor((s) => s.selection.length);

  return (
    <div className="toolbar" role="toolbar" aria-label="Editing tools">
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
          aria-pressed={playing}
          title="Play/Pause (Space)"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <span className="timecode" aria-label="Playhead position">
          {formatTime(playhead)}
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
          data-testid="btn-merge"
          onClick={mergeSelected}
          disabled={!editable}
          title="Join the selected clips"
        >
          Merge
        </button>
      </div>
      <div className="toolbar-group toolbar-end">
        <button type="button" data-testid="btn-export" className="btn-primary" disabled title="Coming in the next step">
          Export
        </button>
      </div>
    </div>
  );
}
