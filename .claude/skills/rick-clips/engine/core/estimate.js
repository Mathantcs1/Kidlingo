// Render-time estimate for the GPU-less container. Calibrated on the sample: 1041 frames of 1080x1920 took 84 s with 3 workers
// (0.081 s/frame). Linear in pixel count. An ESTIMATE: heavier sets or other machines differ.
const SEC_PER_FRAME_AT_1080x1920 = 0.081, PIXELS_REF = 1080 * 1920;
export const BUDGET_SECONDS = 2 * 3600;
const STYLE_FACTOR = { classic: 1, sketch: 1.6 };   // sketch: 0.13 vs 0.081 s/frame, one measurement (35.5 s film, 3 workers)
export function estimateRenderSeconds({ dur, fps, w, h, style = 'classic' }) {
  return Math.round(dur * fps * SEC_PER_FRAME_AT_1080x1920 * (STYLE_FACTOR[style] ?? 1) * ((w * h) / PIXELS_REF) * 100) / 100;
}
export const exceedsBudget = seconds => seconds > BUDGET_SECONDS;
