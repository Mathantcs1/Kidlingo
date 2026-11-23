// Things a shot can look AT instead of at a character (insert shots): screen position as a fraction of the frame, and the plane it lives on.
export const SKETCH_LOOKS = {
  bakery: { oven: { x: 0.84, y: 0.62, depth: 0.35 }, shelf: { x: 0.2, y: 0.5, depth: 0.35 }, window: { x: 0.5, y: 0.3, depth: 0 }, counter: { x: 0.5, y: 0.82, depth: 0.75 }, basket: { x: 0.82, y: 0.76, depth: 0.75 }, mug: { x: 0.27, y: 0.8, depth: 0.75 } },
  street: { lamp: { x: 0.1, y: 0.6, depth: 0.9 }, moon: { x: 0.78, y: 0.16, depth: 0 }, houses: { x: 0.5, y: 0.55, depth: 0.3 }, tree: { x: 0.92, y: 0.75, depth: 0.9 } },
  shopfront: { sign: { x: 0.5, y: 0.37, depth: 0.58 }, door: { x: 0.5, y: 0.6, depth: 0.58 }, window: { x: 0.24, y: 0.54, depth: 0.58 }, lamp: { x: 0.1, y: 0.62, depth: 0.9 } },
  bench: { loaves: { x: 0.4, y: 0.72, depth: 0.75 }, window: { x: 0.5, y: 0.3, depth: 0 }, shelf: { x: 0.16, y: 0.5, depth: 0.35 }, pin: { x: 0.84, y: 0.68, depth: 0.75 } },
  desk: { card: { x: 0.3, y: 0.33, depth: 0.3 }, wrappers: { x: 0.5, y: 0.82, depth: 0.8 }, jar: { x: 0.9, y: 0.78, depth: 0.8 }, bowl: { x: 0.06, y: 0.8, depth: 0.8 } },
  clock: { clock: { x: 0.72, y: 0.24, depth: 0.2 }, window: { x: 0.27, y: 0.46, depth: 0.05 }, oven: { x: 0.88, y: 0.62, depth: 0.4 }, bowl: { x: 0.3, y: 0.76, depth: 0.8 } },
  calendar: { page: { x: 0.38, y: 0.45, depth: 0.55 }, window: { x: 0.82, y: 0.3, depth: 0.3 }, days: { x: 0.3, y: 0.55, depth: 0.55 } },
  queue: { door: { x: 0.12, y: 0.58, depth: 0.45 }, sign: { x: 0.12, y: 0.4, depth: 0.45 }, end: { x: 0.85, y: 0.55, depth: 0.65 }, lamp: { x: 0.94, y: 0.7, depth: 0.9 } },
  promise: { seal: { x: 0.5, y: 0.42, depth: 0.8 }, loaf: { x: 0.5, y: 0.66, depth: 0.6 }, glow: { x: 0.5, y: 0.52, depth: 0.3 } },
  talk: { bubbles: { x: 0.5, y: 0.45, depth: 0.8 }, lamp: { x: 0.06, y: 0.7, depth: 0.95 }, houses: { x: 0.5, y: 0.55, depth: 0.3 } },
  finale: { sign: { x: 0.5, y: 0.33, depth: 0.58 }, sun: { x: 0.8, y: 0.2, depth: 0.1 }, crowd: { x: 0.5, y: 0.68, depth: 0.65 } },
};
