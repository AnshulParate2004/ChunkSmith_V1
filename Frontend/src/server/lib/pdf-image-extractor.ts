import zlib from "zlib";

export interface ExtractedImage {
  name: string;
  mimeType: string;
  buffer: Buffer;
  base64: string;
  size: number;
}

function encodeRgbToPng(width: number, height: number, rawRgb: Buffer): Buffer {
  const scanlineLength = width * 3;
  const filtered = Buffer.alloc(height * (scanlineLength + 1));
  for (let y = 0; y < height; y++) {
    filtered[y * (scanlineLength + 1)] = 0; // Filter type 0: None
    rawRgb.copy(
      filtered,
      y * (scanlineLength + 1) + 1,
      y * scanlineLength,
      (y + 1) * scanlineLength
    );
  }

  const idatData = zlib.deflateSync(filtered);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8-bit depth
  ihdr.writeUInt8(2, 9); // Color type 2: RGB
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(b: Buffer): number {
    let crc = -1;
    for (let i = 0; i < b.length; i++) {
      crc = crcTable[(crc ^ b[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ -1) >>> 0;
  }

  function makeChunk(type: string, data: Buffer): Buffer {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, "ascii");
    data.copy(buf, 8);
    buf.writeUInt32BE(crc32(buf.subarray(4, 8 + len)), 8 + len);
    return buf;
  }

  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idatData),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Extracts embedded images directly from a PDF buffer:
 * 1. DCTDecode streams (embedded JPEGs)
 * 2. FlateDecode streams (embedded PNG / raw RGB bitmaps)
 */
export function extractImagesFromPdf(pdfBuffer: Buffer): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  let imgIndex = 1;

  // 1. Extract embedded JPEGs
  let startIdx = 0;
  while (true) {
    const start = pdfBuffer.indexOf(Buffer.from([0xFF, 0xD8, 0xFF]), startIdx);
    if (start === -1) break;

    const end = pdfBuffer.indexOf(Buffer.from([0xFF, 0xD9]), start + 3);
    if (end === -1) break;

    const imgBuf = pdfBuffer.subarray(start, end + 2);
    if (imgBuf.length > 3000) {
      images.push({
        name: `figure_${imgIndex}.jpg`,
        mimeType: "image/jpeg",
        buffer: imgBuf,
        base64: `data:image/jpeg;base64,${imgBuf.toString("base64")}`,
        size: imgBuf.length,
      });
      imgIndex++;
    }

    startIdx = end + 2;
  }

  // 2. Extract embedded FlateDecode RGB images (PNGs)
  const str = pdfBuffer.toString("binary");
  let searchPos = 0;

  while (true) {
    const imgIdx = str.indexOf("/Subtype/Image", searchPos);
    const altIdx = str.indexOf("/Subtype /Image", searchPos);
    const pos =
      imgIdx !== -1 && altIdx !== -1
        ? Math.min(imgIdx, altIdx)
        : imgIdx !== -1
        ? imgIdx
        : altIdx;

    if (pos === -1) break;

    const streamStart = str.indexOf("stream", pos);
    if (streamStart === -1) break;

    const header = str.substring(Math.max(0, pos - 250), streamStart);
    // Ignore transparency masks
    const isMask = /\/ColorSpace\s*\/DeviceGray|\/ImageMask\s*true/.test(header);

    const wMatch = header.match(/\/Width\s+(\d+)/);
    const hMatch = header.match(/\/Height\s+(\d+)/);
    const isFlate = /\/Filter\s*(\/FlateDecode|\[\s*\/FlateDecode\s*\])/.test(header);

    if (isFlate && !isMask && wMatch && hMatch) {
      const width = parseInt(wMatch[1], 10);
      const height = parseInt(hMatch[1], 10);

      let dataStart = streamStart + 6;
      if (pdfBuffer[dataStart] === 0x0D && pdfBuffer[dataStart + 1] === 0x0A) {
        dataStart += 2;
      } else if (pdfBuffer[dataStart] === 0x0A || pdfBuffer[dataStart] === 0x0D) {
        dataStart += 1;
      }

      const streamEnd = str.indexOf("endstream", dataStart);
      if (streamEnd !== -1) {
        const rawStream = pdfBuffer.subarray(dataStart, streamEnd);
        try {
          const inflated = zlib.inflateSync(rawStream);
          if (inflated.length === width * height * 3 && width >= 64 && height >= 64) {
            const pngBuf = encodeRgbToPng(width, height, inflated);
            images.push({
              name: `figure_${imgIndex}.png`,
              mimeType: "image/png",
              buffer: pngBuf,
              base64: `data:image/png;base64,${pngBuf.toString("base64")}`,
              size: pngBuf.length,
            });
            imgIndex++;
          }
        } catch {}
      }
    }

    searchPos = streamStart + 7;
  }

  return images;
}

/**
 * Associates extracted images with the most relevant chunks.
 * Matches "Figure X" or "Fig. X" text mentions, or distributes them across document chunks.
 */
export function attachImagesToChunks(
  chunks: Array<{
    chunk_id?: string;
    text: string;
    image_paths: string[];
    image_base64: string[];
    metadata: Record<string, any>;
  }>,
  images: Array<{
    name: string;
    publicUrl: string;
    base64: string;
    index: number;
  }>
) {
  if (!chunks.length || !images.length) return;

  const assignedImages = new Set<number>();

  // 1. Try matching Figure X / Fig. X in chunk text
  images.forEach((img) => {
    const figNum = img.index + 1;
    const regex = new RegExp(`\\bFigure\\s+${figNum}\\b|\\bFig\\.?\\s*${figNum}\\b`, "i");

    const matchingChunk = chunks.find((c) => regex.test(c.text));
    if (matchingChunk) {
      if (!matchingChunk.image_paths) matchingChunk.image_paths = [];
      if (!matchingChunk.image_base64) matchingChunk.image_base64 = [];

      matchingChunk.image_paths.push(img.publicUrl);
      matchingChunk.image_base64.push(img.base64);

      matchingChunk.metadata.image_paths = matchingChunk.image_paths;
      matchingChunk.metadata.image_base64 = matchingChunk.image_base64;
      matchingChunk.metadata.type = "Image";

      const types: string[] = matchingChunk.metadata.content_types || ["text"];
      if (!types.includes("image")) types.push("image");
      matchingChunk.metadata.content_types = types;

      assignedImages.add(img.index);
    }
  });

  // 2. Distribute any unassigned images across chunks
  images.forEach((img) => {
    if (assignedImages.has(img.index)) return;

    // Pick a chunk proportionally based on image index
    const targetIdx = Math.min(
      chunks.length - 1,
      Math.floor(((img.index + 0.5) / images.length) * chunks.length)
    );
    const targetChunk = chunks[targetIdx];

    if (!targetChunk.image_paths) targetChunk.image_paths = [];
    if (!targetChunk.image_base64) targetChunk.image_base64 = [];

    targetChunk.image_paths.push(img.publicUrl);
    targetChunk.image_base64.push(img.base64);

    targetChunk.metadata.image_paths = targetChunk.image_paths;
    targetChunk.metadata.image_base64 = targetChunk.image_base64;
    targetChunk.metadata.type = "Image";

    const types: string[] = targetChunk.metadata.content_types || ["text"];
    if (!types.includes("image")) types.push("image");
    targetChunk.metadata.content_types = types;
  });
}
