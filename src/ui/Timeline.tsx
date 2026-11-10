import { useState } from 'react';
import type { MouseEvent } from 'react';
import { clipDuration } from '../core/model';
import type { Clip, MediaRef } from '../core/model';
import { timelineDuration } from '../core/timeline';
import { useEditor } from '../state/store';
import { toggleSelection } from './edits';
import { DEFAULT_PPS, MAX_PPS, MIN_PPS, contentSeconds, pxToTime, rulerTicks, timeToPx, trackLabels, zoom } from './layout';

interface ClipViewProps {
  clip: Clip;
  media: MediaRef | undefined;
  pps: number;
  selected: boolean;
}

function ClipView({ clip, media, pps, selected }: ClipViewProps) {
  const missing = media?.missing === true;
  const name = media?.name ?? 'Unknown media';
  const onClick = (e: MouseEvent): void => {
    e.stopPropagation();
    const { selection, select } = useEditor.getState();
    select(toggleSelection(selection, clip.id, e.shiftKey || e.metaKey || e.ctrlKey));
  };
  return (
    <button
      type="button"
      className={`clip clip-${clip.kind}${selected ? ' is-selected' : ''}${missing ? ' is-missing' : ''}`}
      style={{ left: timeToPx(clip.start, pps), width: timeToPx(clipDuration(clip), pps) }}
      data-testid="timeline-clip"
      data-clip-id={clip.id}
      data-selected={String(selected)}
      data-missing={missing ? 'true' : undefined}
      aria-pressed={selected}
      title={missing ? `${name} (missing media)` : name}
      onClick={onClick}
    >
      <span className="clip-name">{name}</span>
      {missing && <span className="clip-missing">missing media</span>}
    </button>
  );
}

export default function Timeline() {
  const project = useEditor((s) => s.history.present);
  const selection = useEditor((s) => s.selection);
  const playhead = useEditor((s) => s.playhead);
  const [pps, setPps] = useState(DEFAULT_PPS);

  const seconds = contentSeconds(timelineDuration(project));
  const width = timeToPx(seconds, pps);
  const labels = trackLabels(project.tracks.map((t) => t.kind));
  const selected = new Set(selection);

  const onRulerClick = (e: MouseEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    useEditor.getState().setPlayhead(pxToTime(e.clientX - rect.left, pps));
  };
  const clearSelection = (): void => {
    if (useEditor.getState().selection.length > 0) useEditor.getState().select([]);
  };

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-bar">
        <h2>Timeline</h2>
        <div className="zoom">
          <button
            type="button"
            data-testid="btn-zoom-out"
            aria-label="Zoom out"
            disabled={pps <= MIN_PPS}
            onClick={() => setPps((z) => zoom(z, 'out'))}
          >
            −
          </button>
          <span className="zoom-level">{Math.round(pps)} px/s</span>
          <button
            type="button"
            data-testid="btn-zoom-in"
            aria-label="Zoom in"
            disabled={pps >= MAX_PPS}
            onClick={() => setPps((z) => zoom(z, 'in'))}
          >
            +
          </button>
        </div>
      </div>
      <div className="timeline-body">
        <div className="track-labels">
          <div className="ruler-spacer" />
          {labels.map((label, i) => (
            <div key={project.tracks[i].id} className={`track-label track-label-${project.tracks[i].kind}`}>
              {label}
            </div>
          ))}
        </div>
        <div className="timeline-scroll">
          <div className="timeline-content" style={{ width }}>
            <div className="ruler" data-testid="timeline-ruler" onClick={onRulerClick}>
              {rulerTicks(seconds, pps).map((t) => (
                <span key={t.time} className="tick" style={{ left: timeToPx(t.time, pps) }}>
                  {t.label}
                </span>
              ))}
            </div>
            {project.tracks.map((track, i) => (
              <div
                key={track.id}
                className={`lane lane-${track.kind}`}
                data-testid="timeline-track"
                aria-label={labels[i]}
                onClick={clearSelection}
              >
                {track.clips.map((c) => (
                  <ClipView key={c.id} clip={c} media={project.media[c.mediaId]} pps={pps} selected={selected.has(c.id)} />
                ))}
              </div>
            ))}
            <div className="playhead" data-testid="playhead" style={{ left: timeToPx(playhead, pps) }} />
          </div>
        </div>
      </div>
    </section>
  );
}
