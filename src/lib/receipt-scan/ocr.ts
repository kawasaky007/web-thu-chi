export const MAX_RECEIPT_IMAGE_BYTES = 15_000_000; // 15 MB
const MAX_IMAGE_DIMENSION = 1800;

type TesseractWorker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

let workerPromise: Promise<TesseractWorker> | null = null;
let currentOnProgress: ((percent: number) => void) | undefined;

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("vie", 1, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/core",
        langPath: "/tesseract/lang-data",
        logger: (message) => {
          if (message.status === "recognizing text") {
            currentOnProgress?.(Math.round(message.progress * 100));
          }
        },
      });
    })();
  }
  return workerPromise;
}

export async function recognizeReceiptImage(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  if (file.size > MAX_RECEIPT_IMAGE_BYTES) {
    throw new Error("RECEIPT_IMAGE_TOO_LARGE");
  }

  const image = await resizeImageIfNeeded(file, MAX_IMAGE_DIMENSION);
  const worker = await getWorker();

  currentOnProgress = onProgress;
  try {
    const result = await worker.recognize(image);
    return result.data.text;
  } finally {
    currentOnProgress = undefined;
  }
}

async function resizeImageIfNeeded(file: File, maxDimension: number): Promise<File | Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const largestSide = Math.max(bitmap.width, bitmap.height);
  if (largestSide <= maxDimension) {
    bitmap.close();
    return file;
  }

  const scale = maxDimension / largestSide;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.92);
  });
}
