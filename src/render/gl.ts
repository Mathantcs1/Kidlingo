// WebGL2 helpers for the compositor, split across glProgram.ts (context, shaders), glTexture.ts and quad.ts. This barrel
// keeps the import path stable; the pure geometry lives in ./geometry and is re-exported here too.
export * from './geometry';
export { createContext, createProgram, forceOpaque } from './glProgram';
export { createTexture, uploadTexture } from './glTexture';
export type { TextureSlot } from './glTexture';
export { QuadRenderer } from './quad';
