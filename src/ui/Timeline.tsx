import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { timelineDuration } from '../core/timeline';
import { trackLabel } from '../core/tracks';
import { useEditor } from '../state/store';
import Lane from './Lane';
import NewLayerZone, { ZONE_HEIGHT } from './NewLayerZone';
import TimelineBar from './TimelineBar';
import TrackHeader from './TrackHeader';
import { DEFAULT_PPS, contentSeconds, rulerTicks, timeToPx, zoom } from './layout';
import { HEADER_WIDTH, displayOrder, moveTarget } from './trackLayout';
import { useClipDrag } from './useClipDrag';
import { useFollowPlayhead } from './useFollowPlayhead';
import { useScrub } from './useScrub';

/**
 * The timeline; `inert` while another tab owns the editor. One scroll container holds every row: the track headers
 * stick to its left edge and the ruler to its top, so headers and lanes always scroll together.
 */
export default function Timeline({ inert }: { inert: boolean }) {
  const project = useEditor((s) => s.history.present);
  const selection = useEditor((s) => s.selection);
  const activeTrackId = useEditor((s) => s.activeTrackId);
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const [pps, setPps] = useState(DEFAULT_PPS);

  const seconds = contentSeconds(timelineDuration(project));
  const width = timeToPx(seconds, pps);
  const rows = displayOrder(project.tracks);
  const count = (kind: string): number => project.tracks.filter((t) => t.kind === kind).length;
  const selected = new Set(selection);

  const rulerRef = useRef<HTMLDivElement>(null);
  const scrub = useScrub(rulerRef, pps);
  const { preview, begin } = useClipDrag(pps);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onScroll = useFollowPlayhead(scrollRef, timeToPx(playhead, pps), playing, HEADER_WIDTH);
  const vars = { '--headers-w': `${HEADER_WIDTH}px` } as CSSProperties;

  return (
    <section className="timeline" aria-label="Timeline" inert={inert}>
      <TimelineBar pps={pps} onZoom={(dir) => setPps((z) => zoom(z, dir))} soloActive={project.tracks.some((t) => t.solo)} />
      <div className="timeline-scroll" data-testid="timeline-scroll" ref={scrollRef} onScroll={onScroll} style={vars}>
        <div className="timeline-grid" style={{ width: HEADER_WIDTH + width }}>
          <div className="track-headers">
            <div className="headers-corner" />
            <div className="zone-spacer" style={{ height: ZONE_HEIGHT }} aria-hidden="true" />
            {rows.map((track) => (
              <TrackHeader
                key={track.id}
                track={track}
                label={trackLabel(project, track.id)}
                active={track.id === activeTrackId}
                canMoveUp={moveTarget(project.tracks, track.id, 'up') !== null}
                canMoveDown={moveTarget(project.tracks, track.id, 'down') !== null}
                canRemove={count(track.kind) > 1}
              />
            ))}
            <div className="zone-spacer" style={{ height: ZONE_HEIGHT }} aria-hidden="true" />
          </div>
          <div className="timeline-content" style={{ width }}>
            <div className="ruler" data-testid="timeline-ruler" ref={rulerRef} {...scrub}>
              {rulerTicks(seconds, pps).map((t) => (
                <span key={t.time} className="tick" style={{ left: timeToPx(t.time, pps) }}>
                  {t.label}
                </span>
              ))}
              <div
                className="playhead-handle"
                data-testid="playhead-handle"
                aria-hidden="true"
                style={{ left: timeToPx(playhead, pps) }}
              />
            </div>
            <NewLayerZone kind="video" project={project} pps={pps} preview={preview} />
            {rows.map((track) => (
              <Lane
                key={track.id}
                project={project}
                track={track}
                label={trackLabel(project, track.id)}
                pps={pps}
                selected={selected}
                preview={preview}
                onDragStart={begin}
              />
            ))}
            <NewLayerZone kind="audio" project={project} pps={pps} preview={preview} />
            <div className="playhead" data-testid="playhead" style={{ left: timeToPx(playhead, pps) }} />
          </div>
        </div>
      </div>
    </section>
  );
}
