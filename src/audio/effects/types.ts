// Web Audio side of an effect: a node pair built from clamped params (engine-only; core never imports this).
import type { EffectSchema } from './params';

export interface EffectNodes {
  input: AudioNode;
  output: AudioNode;
  /** Every node of the effect (disconnected on dispose, which also breaks feedback loops). */
  all: AudioNode[];
}

export type EffectBuilder = (ctx: BaseAudioContext, params: Record<string, number>) => EffectNodes;

export interface EffectDef extends EffectSchema {
  build: EffectBuilder;
}

/** One node used as both ends (simple effects). */
export const single = (node: AudioNode): EffectNodes => ({ input: node, output: node, all: [node] });

export const dbToGain = (db: number): number => 10 ** (db / 20);
