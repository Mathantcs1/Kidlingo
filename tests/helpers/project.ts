// Fixtures build projects at the current data version via this constant, so a version bump touches one place.
// Tests whose point is a specific old version (migration tests) keep their own literal.
export { CURRENT_VERSION } from '../../src/core/model';
