import { useState } from 'react';
import type { DragEvent } from 'react';
import type { MediaRef } from '../core/model';
import { useEditor } from '../state/store';
import { addToTimeline } from './commands';
import { addMedia } from './edits';
import { formatTime } from './layout';
import { MEDIA_MIME, setDraggedMedia } from './mediaDrag';
import { showError } from './Toast';

interface Pending {
  key: number;
  name: string;
}

const KIND_LABEL: Record<MediaRef['kind'], string> = { video: 'Video', audio: 'Audio', image: 'Image' };
const KIND_ICON: Record<MediaRef['kind'], string> = { video: '🎬', audio: '🎵', image: '🖼' };

let pendingSeq = 0;

function MediaItem({ m, editable }: { m: MediaRef; editable: boolean }) {
  return (
    <li
      className={`media-item${m.missing ? ' is-missing' : ''}`}
      data-testid="media-item"
      data-media-id={m.id}
      data-kind={m.kind}
      data-has-audio={String(m.hasAudio)}
      draggable={editable}
      onDragStart={(e) => {
        e.dataTransfer.setData(MEDIA_MIME, m.id);
        e.dataTransfer.effectAllowed = 'copy';
        setDraggedMedia(m.id);
      }}
      onDragEnd={() => setDraggedMedia(null)}
    >
      <span className="media-icon" aria-hidden="true">
        {KIND_ICON[m.kind]}
      </span>
      <div className="media-info">
        <span className="media-name" title={m.name}>
          {m.name}
        </span>
        <span className="media-meta">
          <span>{KIND_LABEL[m.kind]}</span>
          <span>{formatTime(m.duration)}</span>
          {m.hasAudio && <span className="badge">Audio</span>}
          {m.missing && <span className="badge badge-warn">Missing</span>}
        </span>
      </div>
      <button
        type="button"
        className="btn-icon"
        data-testid="btn-add-to-timeline"
        aria-label={`Add ${m.name} to the timeline`}
        title="Add to the end of the timeline"
        disabled={!editable}
        onClick={() => addToTimeline(m.id)}
      >
        +
      </button>
    </li>
  );
}

export default function MediaBin({ supported, ready }: { supported: boolean; ready: boolean }) {
  const canImport = supported && ready;
  const media = useEditor((s) => s.history.present.media);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragOver, setDragOver] = useState(false);

  async function importAll(files: File[]): Promise<void> {
    const items = files.map((f) => ({ key: ++pendingSeq, name: f.name }));
    setPending((p) => [...p, ...items]);
    for (const [i, file] of files.entries()) {
      try {
        // Loaded on first use so the media toolkit stays out of the startup bundle.
        const { importFile } = await import('../media/import');
        const m = await importFile(file);
        useEditor.getState().apply((p) => addMedia(p, m));
      } catch (e) {
        const known = e instanceof Error && e.name === 'ImportError';
        if (!known) console.error('clipforge: import failed', e);
        showError(known ? e.message : `Could not import ${file.name}: ${String(e)}`);
      } finally {
        setPending((p) => p.filter((x) => x.key !== items[i].key));
      }
    }
  }

  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    setDragOver(false);
    if (canImport && e.dataTransfer.files.length > 0) void importAll([...e.dataTransfer.files]);
  };

  const list = Object.values(media);
  return (
    <aside
      className={`media-bin${dragOver ? ' is-drag-over' : ''}`}
      aria-label="Media bin"
      onDragOver={(e) => {
        // Only files import here; media dragged out of the bin itself is not a drop for the bin.
        if (!canImport || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="panel-head">
        <h2>Media</h2>
        <label className={`btn btn-primary${canImport ? '' : ' is-disabled'}`}>
          Import
          <input
            className="visually-hidden"
            type="file"
            multiple
            accept="video/*,audio/*,image/*"
            data-testid="file-input"
            disabled={!canImport}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length > 0) void importAll(files);
            }}
          />
        </label>
      </div>
      <ul className="media-list">
        {list.map((m) => (
          <MediaItem key={m.id} m={m} editable={ready} />
        ))}
        {pending.map((p) => (
          <li key={p.key} className="media-item is-importing" data-testid="media-importing">
            <span className="spinner" aria-hidden="true" />
            <span className="media-name">{p.name}</span>
            <span className="media-meta">Importing…</span>
          </li>
        ))}
      </ul>
      {list.length === 0 && pending.length === 0 && (
        <p className="empty-hint">{supported ? 'Import or drop video, audio and images here.' : 'Import is unavailable.'}</p>
      )}
    </aside>
  );
}
