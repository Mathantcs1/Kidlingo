// Script vocabulary shared by validation and the film page. Keep in step with rig.js FACES and the page's figures().
export const FACE_NAMES = ['flat', 'smug', 'shock'];
export const CAST_NAMES = ['baker', 'neighbours', 'none'];
export const OVERLAYS = ['cctv'];
export const DIRECTIVE_KEYS = ['set', 'cam', 'face', 'cast', 'overlay', 'cut', 'look', 'frame'];

/** Vocabularies a style validates scripts against. */
import { CAM_NAMES } from './cams.js';
import { SKETCH_CAM_NAMES } from './sketchcams.js';
import { SKETCH_LOOKS } from './sketchlooks.js';
export const CLASSIC_VOCAB = { cast: CAST_NAMES, faces: FACE_NAMES, overlays: OVERLAYS, cams: CAM_NAMES };
export const SKETCH_VOCAB = { cast: ['rosa', 'dario', 'neighbours', 'crowd', 'none'], faces: ['flat', 'smug', 'shock', 'joy'], overlays: [], cams: SKETCH_CAM_NAMES, looks: SKETCH_LOOKS };
