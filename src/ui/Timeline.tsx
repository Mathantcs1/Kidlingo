import { useRef, useState } from 'react';
import { timelineDuration } from '../core/timeline';
import { useEditor } from '../state/store';
import Lane from './Lane';
import { DEFAULT_PPS, MAX_PPS, MIN_PPS, contentSeconds, rulerTicks, timeToPx, trackLabels, zoom } from './layout';
import { useClipDrag } from './useClipDrag';
import { useScrub } from './useScrub';

/** The timeline; `inert` while another tab owns the editor. */
export default function Timeline({ inert }: { inert: boolean }) {
  const project = useEditor((s) => s.history.present);
  const selection = useEditor((s) => s.selection);
  const playhead = useEditor((s) => s.playhead);
  const [pps, setPps] = useState(DEFAULT_PPS);

  const seconds = contentSeconds(timelineDuration(project));
  const width = timeToPx(seconds, pps);
  const labels = trackLabels(project.tracks.map((t) => t.kind));
  const selected = new Set(selection);

  const rulerRef = useRef<HTMLDivElement>(null);
  const scrub = useScrub(rulerRef, pps);
  const { preview, begin } = useClipDrag(pps);

  return (
    <section className="timeline" aria-label="Timeline" inert={inert}>
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
            <div className="ruler" data-testid="timeline-ruler" ref={rulerRef} {...scrub}>
              {rulerTicks(seconds, pps).map((t) => (
                <span key={t.time} className="tick" style={{ left: timeToPx(t.time, pps) }}>
                  {t.label}
                </span>
              ))}
            </div>
            {project.tracks.map((track, i) => (
              <Lane
                key={track.id}
                project={project}
                track={track}
                label={labels[i]}
                pps={pps}
                selected={selected}
                preview={preview}
                onDragStart={begin}
              />
            ))}
            <div className="playhead" data-testid="playhead" style={{ left: timeToPx(playhead, pps) }}>
              <div className="playhead-handle" data-testid="playhead-handle" aria-hidden="true" {...scrub} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
