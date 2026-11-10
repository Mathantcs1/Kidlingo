import { MAX_PPS, MIN_PPS } from './layout';
import { addLayer } from './trackCommands';

interface TimelineBarProps {
  pps: number;
  onZoom(dir: 'in' | 'out'): void;
  /** True while any track is soloed: everything not soloed is silent. */
  soloActive: boolean;
}

/** The timeline's title row: add-track buttons, the solo indicator and zoom. */
export default function TimelineBar({ pps, onZoom, soloActive }: TimelineBarProps) {
  return (
    <div className="timeline-bar">
      <div className="timeline-bar-left">
        <h2>Timeline</h2>
        <button type="button" data-testid="btn-add-video-layer" onClick={() => addLayer('video')}>
          + Video layer
        </button>
        <button type="button" data-testid="btn-add-audio-track" onClick={() => addLayer('audio')}>
          + Audio track
        </button>
        {soloActive && (
          <span
            className="solo-indicator"
            data-testid="solo-indicator"
            role="status"
            title="Only soloed tracks are heard"
          >
            Solo on: only soloed tracks are heard
          </span>
        )}
      </div>
      <div className="zoom">
        <button
          type="button"
          data-testid="btn-zoom-out"
          aria-label="Zoom out"
          disabled={pps <= MIN_PPS}
          onClick={() => onZoom('out')}
        >
          −
        </button>
        <span className="zoom-level">{Math.round(pps)} px/s</span>
        <button
          type="button"
          data-testid="btn-zoom-in"
          aria-label="Zoom in"
          disabled={pps >= MAX_PPS}
          onClick={() => onZoom('in')}
        >
          +
        </button>
      </div>
    </div>
  );
}
