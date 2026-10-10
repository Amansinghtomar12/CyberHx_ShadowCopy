/**
 * Turning an organiser's picture into a scene plate, in their browser.
 *
 * WHY HERE
 *   The twelve original scenes were prepared by a script: resized to the
 *   sizes the board paints, then measured — the luminance-weighted centroid
 *   for the focal point, the brightest cell of a 16x16 grid for the light,
 *   the most saturated populated hue for the accent. Those numbers are what
 *   stop a background cropping the subject out on a phone and what give a
 *   card a border drawn from its own art.
 *
 *   An organiser uploading art during their own event has no script. The
 *   browser has a canvas, which is all the script needed, so the same three
 *   measurements are taken here rather than guessed or left to a default.
 *
 * WHAT IT PRODUCES
 *   One WebP, at most 1920 wide, plus the numbers. One file rather than the
 *   three a bundled plate carries: those are built once at a known size and
 *   shipped, while this is uploaded over an event's own connection, and a
 *   single 1920 file the browser scales is the better trade for art that
 *   may be added minutes before it is needed.
 *
 * SAFETY
 *   Everything runs on a canvas the page already owns. The file is decoded
 *   by the browser's own image decoder, re-encoded by it, and never
 *   executed; a file that is not an image fails to decode and is refused
 *   with a sentence.
 */

/** The measurements the board needs, as fractions of the image. */
export interface ArtMeasurements {
  /** Where the subject is, clamped well inside the frame. */
  focal: { x: number; y: number };
  /** Where the light is, so bloom and rays leave the painted source. */
  sun: { x: number; y: number };
  /** The art's own signature colour, for the card's thin glowing border. */
  accent: string;
}

export interface PreparedArt extends ArtMeasurements {
  /** The re-encoded file, ready to upload. */
  blob: Blob;
  width: number;
  height: number;
  /** An object URL for the preview. The caller revokes it. */
  previewUrl: string;
}

/** The widest the board ever paints a plate. */
const MAX_WIDTH = 1920;
/** Keeps a 1920-wide painting around a quarter of a megabyte. */
const QUALITY = 0.82;
/** Refuse early rather than after a long decode. */
const MAX_INPUT_BYTES = 24 * 1024 * 1024;

/**
 * Decode a file the way an <img> would, so anything the browser can paint
 * is accepted and anything else fails here with a usable message.
 */
function decode(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

function draw(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser would not give the page a canvas to work on.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/**
 * The three numbers, from a small copy of the picture.
 *
 * Measured at 160x90 (and 16x16 for the light) exactly as the script did:
 * a thumbnail is enough to find where a painting's weight and brightness
 * sit, and reading four million pixels in a loop would lock the tab.
 */
function measure(img: HTMLImageElement): ArtMeasurements {
  const small = draw(img, 160, 90);
  const ctx = small.getContext('2d');
  if (!ctx) throw new Error('This browser would not give the page a canvas to work on.');
  const { data } = ctx.getImageData(0, 0, 160, 90);

  let total = 0, sx = 0, sy = 0;
  // Accent: the most saturated populated hue, bucketed, so one bright pixel
  // cannot speak for a painting.
  const hueWeight = new Float64Array(36);
  const hueSat = new Float64Array(36);
  const hueLum = new Float64Array(36);

  for (let y = 0; y < 90; y++) {
    for (let x = 0; x < 160; x++) {
      const i = (y * 160 + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // Weight the bright half: the subject of these paintings is lit, and
      // a flat average lands on the frame.
      const w = Math.max(0, lum - 110) ** 2;
      total += w; sx += w * x; sy += w * y;

      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const chroma = max - min;
      if (chroma < 24 || lum < 40 || lum > 232) continue;   // greys and extremes say nothing
      let hue = 0;
      if (max === r) hue = ((g - b) / chroma + 6) % 6;
      else if (max === g) hue = (b - r) / chroma + 2;
      else hue = (r - g) / chroma + 4;
      const bucket = Math.min(35, Math.max(0, Math.floor((hue * 60) / 10)));
      const sat = chroma / max;
      const weight = chroma * sat;
      hueWeight[bucket] += weight;
      hueSat[bucket] += sat * weight;
      hueLum[bucket] += lum * weight;
    }
  }

  // A focal point at the very edge makes one of the two crops cut the
  // subject out entirely, so it is clamped the way the script clamped it.
  const fx = total ? Math.min(Math.max((sx / total) / 160, 0.28), 0.72) : 0.5;
  const fy = total ? Math.min(Math.max((sy / total) / 90, 0.30), 0.70) : 0.5;

  // The light: brightest cell of a 16x16 grid, blurred by the downscale.
  const grid = draw(img, 16, 16).getContext('2d');
  let bestLum = -1, bx = 8, by = 8;
  if (grid) {
    const g16 = grid.getImageData(0, 0, 16, 16).data;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4;
        const lum = 0.2126 * g16[i] + 0.7152 * g16[i + 1] + 0.0722 * g16[i + 2];
        if (lum > bestLum) { bestLum = lum; bx = x; by = y; }
      }
    }
  }

  let top = 0;
  for (let i = 1; i < 36; i++) if (hueWeight[i] > hueWeight[top]) top = i;
  const accent = hueWeight[top] > 0
    ? hslHex(
        (top * 10 + 5) % 360,
        // Lifted into a band that reads on dark glass, rather than taken raw:
        // a washed-out painting should still draw a visible border.
        Math.min(0.78, Math.max(0.42, hueSat[top] / hueWeight[top])),
        Math.min(0.68, Math.max(0.46, (hueLum[top] / hueWeight[top]) / 255)),
      )
    : '#e3bb66';

  return {
    focal: { x: round3(fx), y: round3(fy) },
    sun: { x: round3((bx + 0.5) / 16), y: round3((by + 0.5) / 16) },
    accent,
  };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

function hslHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob
        ? resolve(blob)
        : reject(new Error('The picture could not be re-encoded in this browser.')),
      'image/webp',
      QUALITY,
    );
  });
}

/**
 * A file an organiser picked, as a plate the board can paint and the three
 * numbers it needs. Throws with a sentence an organiser can act on.
 */
export async function prepareArt(file: File): Promise<PreparedArt> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('That picture is over 24 MB. Export it smaller and try again.');
  }
  const img = await decode(file);
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new Error('That file could not be read as an image.');
  }

  const measurements = measure(img);

  // Never upscale: a 900 px painting blown up to 1920 is a bigger file and
  // a softer picture.
  const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  const blob = await encode(draw(img, width, height));

  return {
    ...measurements,
    blob,
    width,
    height,
    previewUrl: URL.createObjectURL(blob),
  };
}

/**
 * The id a scene gets from its name: a slug, because it is also the
 * storage path and the plate key. Matches pinaka_scene_id_slug.
 */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
}
