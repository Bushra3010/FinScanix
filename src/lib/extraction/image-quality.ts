import jpeg from "jpeg-js";
import { PNG } from "pngjs";

/**
 * Pre-processing gate for uploaded images — FR-1.2.
 *
 * A photographed or scanned bill can be unusable in ways the file itself will
 * not admit to: too few pixels to resolve a digit, camera shake, a page shot in
 * shadow, or a photograph of something that is not a document at all. Any of
 * these produce an extraction that looks complete and is wrong, which is worse
 * than a refusal — so they are caught before OCR rather than after.
 *
 * Everything here is measured from the pixels. No model is consulted and no
 * network call is made, so the verdict is deterministic and reproducible: the
 * same file always draws the same conclusion, and the numbers behind it are
 * reported rather than a score with no derivation.
 */

export interface ImageMetric {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ImageQuality {
  usable: boolean;
  /** Why it was refused, in words a person can act on. */
  reason?: string;
  metrics: ImageMetric[];
  width: number;
  height: number;
}

/** Below this on the short side, printed text cannot survive rasterisation. */
const MIN_SHORT_EDGE = 700;

/**
 * Laplacian variance below this reads as out of focus.
 *
 * A sharp document scan runs into the thousands: text is all edges. The
 * threshold sits well under that so a merely soft photograph still passes.
 */
const MIN_SHARPNESS = 60;

/** A page needs contrast between ink and paper to be read at all. */
const MIN_DYNAMIC_RANGE = 45;

/**
 * Proportion of markedly dark pixels. A document page carries text; a
 * photograph of a wall, a floor or a blank sheet does not.
 */
const MIN_INK_COVERAGE = 0.004;
const MAX_INK_COVERAGE = 0.6;

interface Raster {
  width: number;
  height: number;
  /** Greyscale luminance, one byte per pixel. */
  grey: Uint8ClampedArray;
}

/** Dimensions straight from the container header, before any decode. */
function readDimensions(bytes: Uint8Array, mimeType: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (mimeType === "image/png" && bytes.length > 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (mimeType === "image/webp" && bytes.length > 30) {
    // VP8X carries the canvas size as two 24-bit values, minus one.
    const chunk = String.fromCharCode(...bytes.subarray(12, 16));
    if (chunk === "VP8X") {
      const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width: w, height: h };
    }
    if (chunk === "VP8 ") {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
    if (chunk === "VP8L") {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }

  if (mimeType === "image/jpeg") {
    // Walk the segment markers to the frame header, which holds the size.
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      // SOF0..SOF15, excluding the non-frame markers in that range.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return {
          height: view.getUint16(offset + 5),
          width: view.getUint16(offset + 7),
        };
      }
      offset += 2 + view.getUint16(offset + 2);
    }
  }

  return null;
}

/**
 * Decodes to greyscale, downsampling as it goes.
 *
 * Every metric here is statistical, so a long edge of 1000px is ample — and it
 * keeps a 12-megapixel phone photograph from costing a second of CPU per
 * upload. WebP has no pure-JavaScript decoder, so it is measured on its header
 * alone and passes the pixel checks by default rather than being refused for a
 * format decision the uploader did not make.
 */
function rasterise(bytes: Uint8Array, mimeType: string): Raster | null {
  let width: number;
  let height: number;
  let rgba: Uint8Array | Buffer;

  if (mimeType === "image/jpeg") {
    const decoded = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 256 });
    ({ width, height } = decoded);
    rgba = decoded.data;
  } else if (mimeType === "image/png") {
    const decoded = PNG.sync.read(Buffer.from(bytes));
    ({ width, height } = decoded);
    rgba = decoded.data;
  } else {
    return null;
  }

  const step = Math.max(1, Math.floor(Math.max(width, height) / 1000));
  const outW = Math.floor(width / step);
  const outH = Math.floor(height / step);
  const grey = new Uint8ClampedArray(outW * outH);

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const src = ((y * step) * width + x * step) * 4;
      // Rec. 601 luma, which is what "how dark does this look" means.
      grey[y * outW + x] =
        0.299 * rgba[src] + 0.587 * rgba[src + 1] + 0.114 * rgba[src + 2];
    }
  }

  return { width: outW, height: outH, grey };
}

/** Variance of the Laplacian — the standard focus measure. */
function sharpness(raster: Raster) {
  const { width, height, grey } = raster;
  if (width < 3 || height < 3) return 0;

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const value =
        4 * grey[i] - grey[i - 1] - grey[i + 1] - grey[i - width] - grey[i + width];
      sum += value;
      sumSq += value * value;
      count += 1;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

function tones(raster: Raster) {
  const histogram = new Array<number>(256).fill(0);
  for (const value of raster.grey) histogram[value] += 1;

  const total = raster.grey.length;
  // Percentile ends rather than absolute min/max, so a single dust speck or
  // blown highlight cannot pass for contrast.
  const at = (fraction: number) => {
    let seen = 0;
    const target = total * fraction;
    for (let v = 0; v < 256; v++) {
      seen += histogram[v];
      if (seen >= target) return v;
    }
    return 255;
  };

  let dark = 0;
  for (let v = 0; v < 90; v++) dark += histogram[v];

  return {
    low: at(0.02),
    high: at(0.98),
    mean: raster.grey.reduce((sum, v) => sum + v, 0) / total,
    inkCoverage: dark / total,
  };
}

export function assessImage(bytes: Uint8Array, mimeType: string): ImageQuality {
  const metrics: ImageMetric[] = [];
  const dimensions = readDimensions(bytes, mimeType);

  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    return {
      usable: false,
      reason: "This image could not be read. It may be corrupt or not the format its name suggests.",
      metrics: [{ id: "decode", label: "Image readable", passed: false, detail: "No image header found" }],
      width: 0,
      height: 0,
    };
  }

  const shortEdge = Math.min(dimensions.width, dimensions.height);
  const bigEnough = shortEdge >= MIN_SHORT_EDGE;
  metrics.push({
    id: "resolution",
    label: "Resolution",
    passed: bigEnough,
    detail: `${dimensions.width} x ${dimensions.height} px`,
  });

  if (!bigEnough) {
    return {
      usable: false,
      reason: `This image is ${dimensions.width} x ${dimensions.height} pixels, too small to read printed figures from reliably. Rescan at 200 DPI or higher, or photograph the page closer.`,
      metrics,
      ...dimensions,
    };
  }

  let raster: Raster | null = null;
  try {
    raster = rasterise(bytes, mimeType);
  } catch {
    raster = null;
  }

  if (!raster) {
    metrics.push({
      id: "pixels",
      label: "Pixel analysis",
      passed: true,
      detail:
        mimeType === "image/webp"
          ? "WebP is checked on dimensions only; sharpness and exposure are left to the reader"
          : "Could not decode pixels; dimensions accepted on their own",
    });
    return { usable: true, metrics, ...dimensions };
  }

  const focus = sharpness(raster);
  const sharp = focus >= MIN_SHARPNESS;
  metrics.push({
    id: "sharpness",
    label: "Sharpness",
    passed: sharp,
    detail: `focus measure ${focus.toFixed(0)} (needs ${MIN_SHARPNESS}+)`,
  });

  const tone = tones(raster);
  const range = tone.high - tone.low;
  const contrasty = range >= MIN_DYNAMIC_RANGE;
  metrics.push({
    id: "exposure",
    label: "Exposure",
    passed: contrasty,
    detail: `tonal range ${range} across ${tone.low}-${tone.high}, mean ${tone.mean.toFixed(0)}`,
  });

  const looksLikeText =
    tone.inkCoverage >= MIN_INK_COVERAGE && tone.inkCoverage <= MAX_INK_COVERAGE;
  metrics.push({
    id: "content",
    label: "Document content",
    passed: looksLikeText,
    detail: `${(tone.inkCoverage * 100).toFixed(1)}% of the page carries dark marks`,
  });

  // Which measurement failed is not the same as what went wrong, and the
  // uploader needs the second. A flat wall and a shaken photograph both read as
  // unsharp; only one of them is worth retaking. Reading the metrics together
  // is what separates them.
  const hasInk = tone.inkCoverage >= MIN_INK_COVERAGE;

  if (!sharp && !hasInk) {
    return {
      usable: false,
      reason:
        "This does not look like a document — there is no printed detail anywhere on it. Check that the right file was uploaded.",
      metrics,
      ...dimensions,
    };
  }
  if (!sharp) {
    return {
      usable: false,
      reason:
        "This page is out of focus. Retake it with the camera steady and the whole page in frame, or upload the original PDF instead.",
      metrics,
      ...dimensions,
    };
  }
  if (!contrasty) {
    return {
      usable: false,
      reason:
        tone.mean < 90
          ? "This page is too dark to read. Retake it in even light, without shadow falling across the page."
          : "This page has too little contrast to read — it looks washed out or over-exposed. Retake it in even light.",
      metrics,
      ...dimensions,
    };
  }
  if (!looksLikeText) {
    return {
      usable: false,
      reason:
        tone.inkCoverage < MIN_INK_COVERAGE
          ? "This page is effectively blank — there is almost no print on it. Check that the right page was uploaded."
          : "This page is dark across almost all of it, so print cannot be separated from background. Retake it in even light.",
      metrics,
      ...dimensions,
    };
  }

  return { usable: true, metrics, ...dimensions };
}
