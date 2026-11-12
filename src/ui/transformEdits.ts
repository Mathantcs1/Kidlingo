// The transform edits behind the inspector fields and the on-canvas overlay. They are pure and live in src/core
// (static edits in transformEdits.ts, keyed writes in transformKeyEdits.ts, Plan 5); re-exported here for the UI.
export { resetClipTransform, setClipTransform, withClipTransform } from '../core/transformEdits';
export { setTransformAt, withLiveValue } from '../core/transformKeyEdits';
