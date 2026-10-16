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

/** One encoded size of a prepared picture. */
export interface ArtSize {
  blob: Blob;
  width: number;
  height: number;
}

export interface PreparedArt extends ArtMeasurements {
  /**
   * The full-size file: up to 3840 wide, because these are painted
   * full-bleed behind the whole page and a 4K screen asks for 3840. Capped
   * at 1920 before, which made the organisers' own art the blurriest thing
   * on a board whose shipped plates all carry a 3840.
   */
  full: ArtSize;
  /**
   * Half of it, for phones, laptops and the card thumbnails — so a card
   * does not pull a 4K painting to draw it 320 px wide.
   */
  half: ArtSize;
  /** Kept for the preview and for callers that want one file. */
  blob: Blob;
  width: number;
  height: number;
  /** An object URL for the preview. The caller revokes it. */
  previewUrl: string;
}

/**
 * The widest the board ever paints a plate. The shipped chapter and world
 * plates all carry a 3840, and the environment's srcset asks for one on a
 * 4K screen, so art the organisers upload is prepared to match.
 */
const MAX_WIDTH = 3840;
/** The second size, which is what most screens and every card thumbnail take. */
const HALF_WIDTH = 1920;
/** Keeps a 1920-wide painting around a quarter of a megabyte. */
const QUALITY = 0.82;
/** A little lower at 3840: four times the pixels at the same quality is a
    file nobody wants to wait for, and the extra pixels hide the difference. */
const QUALITY_4K = 0.76;
/**
 * Refuse early rather than after a long decode.
 *
 * Generous, because this is an organiser's own machine picking their own
 * art: the file is decoded, resized and re-encoded here, so what crosses
 * the network is the few hundred KB that come out, not what went in.
 */
const MAX_INPUT_BYTES = 64 * 1024 * 1024;

/**
 * What a file actually is, from its first bytes.
 *
 * An extension is a claim, not a fact — image tools and phones hand out
 * `.jpeg` files that are really HEIC or AVIF, and the file picker's
 * `accept` believes the extension. When the browser then refuses to decode
 * one, "that file could not be read as an image" is true and useless: the
 * organiser is looking at a picture that opens fine on their desktop.
 * Naming the real format is the difference between a dead end and a fix.
 */
function sniff(bytes: Uint8Array): string | null {
  const at = (i: number, sig: readonly number[]) => sig.every((b, k) => bytes[i + k] === b);
  const ascii = (i: number, len: number) =>
    String.fromCharCode(...Array.from(bytes.slice(i, i + len)));

  if (at(0, [0xff, 0xd8, 0xff])) return 'JPEG';
  if (at(0, [0x89, 0x50, 0x4e, 0x47])) return 'PNG';
  if (at(0, [0x47, 0x49, 0x46, 0x38])) return 'GIF';
  if (at(0, [0x42, 0x4d])) return 'BMP';
  if (at(0, [0x25, 0x50, 0x44, 0x46])) return 'PDF';
  if (at(0, [0x49, 0x49, 0x2a, 0x00]) || at(0, [0x4d, 0x4d, 0x00, 0x2a])) return 'TIFF';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'WebP';
  // ISO base media: the brand after 'ftyp' says which.
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4).toLowerCase();
    if (brand.startsWith('avi')) return 'AVIF';
    if (brand.startsWith('hei') || brand.startsWith('mif') || brand.startsWith('msf')) return 'HEIC';
    return brand.toUpperCase().trim() || 'ISO media';
  }
  const head = ascii(0, 256).trimStart().toLowerCase();
  if (head.startsWith('<?xml') || head.startsWith('<svg')) return 'SVG';
  return null;
}

/** Formats a browser will not paint onto a canvas, and what to do instead. */
const UNPAINTABLE: Record<string, string> = {
  HEIC: 'HEIC is what iPhones save by default, and browsers cannot read it.',
  AVIF: 'AVIF is not readable in every browser.',
  TIFF: 'TIFF is not a web format.',
  PDF:  'That is a PDF, not an image.',
  SVG:  'An SVG cannot be measured for its focal point or its colour.',
};

/**
 * Decode a file the way an <img> would, so anything the browser can paint
 * is accepted and anything else fails here with a usable message.
 *
 * Tries createImageBitmap first: it reads a few formats `<img>` will not,
 * and `imageOrientation` makes it honour a phone's EXIF rotation, which a
 * canvas draw would otherwise ignore and silently publish sideways.
 */
type Decoded = Exclude<CanvasImageSource, SVGImageElement | VideoFrame> & { width: number; height: number };

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      if (bitmap.width && bitmap.height) return bitmap;
    } catch {
      /* fall through to <img>, which handles a few things bitmaps do not */
    }
  }

  const img = await new Promise<HTMLImageElement | null>(resolve => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
    el.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    el.src = url;
  });
  if (img && img.naturalWidth && img.naturalHeight) {
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  }

  // Nothing could read it, so say what it actually is.
  const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  const kind = sniff(head);
  const named = file.name.split('.').pop()?.toUpperCase() ?? '';
  if (kind && UNPAINTABLE[kind]) {
    throw new Error(
      `${UNPAINTABLE[kind]} Re-export it as JPEG, PNG or WebP and try again`
      + (named && named !== kind ? ` — it is named .${named.toLowerCase()}, but the file is ${kind}.` : '.'),
    );
  }
  if (kind) {
    throw new Error(`That ${kind} file is damaged or incomplete — the browser could not decode it.`);
  }
  throw new Error('That file is not an image the browser can read. Try a JPEG, PNG or WebP.');
}

function draw(img: Decoded, w: number, h: number): HTMLCanvasElement {
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
function measure(img: Decoded): ArtMeasurements {
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

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob
        ? resolve(blob)
        : reject(new Error('The picture could not be re-encoded in this browser.')),
      'image/webp',
      quality,
    );
  });
}

/** One size of the picture, drawn and encoded. */
async function size(img: Decoded, target: number, quality: number): Promise<ArtSize> {
  // Never upscale: a 900 px painting blown up is a bigger file and a softer
  // picture, and the browser can stretch it just as badly for free.
  const scale = Math.min(1, target / img.width);
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  return { blob: await encode(draw(img, width, height), quality), width, height };
}

/**
 * A file an organiser picked, as a plate the board can paint and the three
 * numbers it needs. Throws with a sentence an organiser can act on.
 */
export async function prepareArt(file: File): Promise<PreparedArt> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('That picture is over 64 MB. Export it smaller and try again.');
  }
  const img = await decode(file);

  const measurements = measure(img);

  const full = await size(img, MAX_WIDTH, img.width > HALF_WIDTH ? QUALITY_4K : QUALITY);
  // Only a second file when there is a real difference between them.
  const half = img.width > HALF_WIDTH * 1.2
    ? await size(img, HALF_WIDTH, QUALITY)
    : full;

  return {
    ...measurements,
    full,
    half,
    blob: full.blob,
    width: full.width,
    height: full.height,
    previewUrl: URL.createObjectURL(half.blob),
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
