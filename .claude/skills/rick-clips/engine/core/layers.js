// 2.5D multiplane camera maths. depth: 0 = farthest plane, 1 = nearest. cam: {x, y, zoom} in screen px / zoom factor.
const parallaxFactor = depth => 0.25 + 0.75 * depth;   // far planes move a quarter as much as the nearest

/** Where a layer sits for this camera: truck/pedestal shift (opposite to the camera) and a zoom that scales near planes more. */
export function layerTransform(depth, cam) {
  const p = parallaxFactor(depth);
  // vertigo (dolly-zoom): the far planes swell while the near ones hold, so the world stretches around the subject
  return { dx: -cam.x * p, dy: -cam.y * p, scale: 1 + (cam.zoom - 1) * p + (cam.vertigo || 0) * (0.65 - p) };
}

/** Blur radius (px) of a layer for a focus plane: sharp at the focus, softer the farther it is (rack focus = animate `focus`). */
export const depthBlur = (depth, focus, maxBlur) => Math.abs(depth - focus) * maxBlur;

/** Camera that puts a subject point (u,v = px offset from the plane's centre) at frame centre for a zoom, on the subject's depth plane.
 *  Other planes follow by their own parallax, so aiming at a face also slides the set past it. */
export function aimCamera(subject, zoom, depth, { ox = 0, oy = 0 } = {}) {   // ox/oy: where the subject should land, px from frame centre (rule of thirds)
  const p = parallaxFactor(depth), scale = 1 + (zoom - 1) * p;
  return { x: (scale * subject.u - ox) / p, y: (scale * subject.v - oy) / p, zoom };
}
