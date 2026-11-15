// Frames decoded since the last reset (instrumentation: forward speed must not decode more than ceil(s) + 1 frames per
// output frame, and reverse windows must not re-decode more than their budget allows; read by the test harness).
let decoded = 0;
export const noteDecoded = (): void => { decoded++; };
export const videoDecodeCount = (): number => decoded;
export const resetVideoDecodeCount = (): void => { decoded = 0; };
