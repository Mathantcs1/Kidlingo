// Web Audio side of an effect: a node pair built from clamped params (engine-only; core never imports this).
import type { EffectSchema } from './params';

export interface EffectNodes {
  input: AudioNode;
  output: AudioNode;
  /** Every node of the effect (disconnected on dispose, which also breaks feedback loops). */
  all: AudioNode[];
}

/** Where an effect sits on the context clock (modulated effects keep their phase tied to the clip, not the window). */
export interface EffectTiming {
  /** Context time of the clip's start: phase 0 of any modulation (the same timeline instant in every render). */
  phase0: number;
  /** Context time after which the effect's output is never heard (the segment end): its sources may stop there. */
  end: number;
}

export type EffectBuilder = (ctx: BaseAudioContext, params: Record<string, number>, at: EffectTiming) => EffectNodes;

export interface EffectDef extends EffectSchema {
  build: EffectBuilder;
}

/** One node used as both ends (simple effects). */
export const single = (node: AudioNode): EffectNodes => ({ input: node, output: node, all: [node] });

export const dbToGain = (db: number): number => 10 ** (db / 20);
