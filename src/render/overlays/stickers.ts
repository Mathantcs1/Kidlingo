// The built-in vector stickers, drawn in a 100 x 100 unit square (no fonts or emoji needed, except LIVE/NEW labels).
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface StickerStyle {
  fill: string;
  text: string;
  font: string;
}

function polygon(ctx: Ctx, pts: number[][]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

function starPath(ctx: Ctx, points: number, outer: number, inner: number): void {
  const pts: number[][] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    pts.push([50 + r * Math.cos(a), 52 + r * Math.sin(a)]);
  }
  polygon(ctx, pts);
}

function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function stroked(ctx: Ctx, style: StickerStyle, width: number, draw: () => void): void {
  ctx.strokeStyle = style.fill;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  draw();
  ctx.stroke();
}

function badge(ctx: Ctx, style: StickerStyle, label: string): void {
  rounded(ctx, 6, 28, 88, 44, 10);
  ctx.fill();
  ctx.fillStyle = style.text;
  ctx.font = `800 28px ${style.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 50, 51);
}

/** Draws sticker `shape` (0..11) filling `style.fill`; everything stays inside the unit square. */
export function drawSticker(ctx: Ctx, shape: number, style: StickerStyle): void {
  ctx.fillStyle = style.fill;
  switch (shape) {
    case 0:
      polygon(ctx, [[10, 40], [55, 40], [55, 15], [92, 50], [55, 85], [55, 60], [10, 60]]);
      ctx.fill();
      break;
    case 1:
      starPath(ctx, 5, 44, 18);
      ctx.fill();
      break;
    case 2:
      ctx.beginPath();
      ctx.moveTo(50, 88);
      ctx.bezierCurveTo(8, 56, 8, 18, 30, 18);
      ctx.bezierCurveTo(42, 18, 50, 28, 50, 34);
      ctx.bezierCurveTo(50, 28, 58, 18, 70, 18);
      ctx.bezierCurveTo(92, 18, 92, 56, 50, 88);
      ctx.closePath();
      ctx.fill();
      break;
    case 3:
      stroked(ctx, style, 14, () => {
        ctx.beginPath();
        ctx.moveTo(18, 52);
        ctx.lineTo(40, 74);
        ctx.lineTo(84, 26);
      });
      break;
    case 4:
      stroked(ctx, style, 14, () => {
        ctx.beginPath();
        ctx.moveTo(22, 22);
        ctx.lineTo(78, 78);
        ctx.moveTo(78, 22);
        ctx.lineTo(22, 78);
      });
      break;
    case 5:
      rounded(ctx, 8, 10, 84, 60, 12);
      ctx.fill();
      polygon(ctx, [[28, 66], [24, 92], [54, 66]]);
      ctx.fill();
      break;
    case 6:
      badge(ctx, style, 'LIVE');
      break;
    case 7:
      badge(ctx, style, 'NEW');
      break;
    case 8:
      ctx.beginPath();
      ctx.arc(50, 50, 42, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 9:
      starPath(ctx, 12, 46, 32);
      ctx.fill();
      break;
    case 10:
      stroked(ctx, style, 10, () => {
        ctx.beginPath();
        ctx.moveTo(10, 62);
        ctx.bezierCurveTo(30, 40, 50, 80, 90, 46);
      });
      break;
    default:
      polygon(ctx, [[30, 10], [30, 78], [46, 63], [58, 88], [70, 82], [58, 58], [80, 58]]);
      ctx.fill();
  }
}
