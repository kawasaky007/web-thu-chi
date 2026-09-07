export const MAX_RECEIPT_IMAGE_BYTES = 15_000_000; // 15 MB
const MAX_IMAGE_DIMENSION = 1800;

type TesseractWorker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

let workerPromise: Promise<TesseractWorker> | null = null;
let activeWorker: TesseractWorker | null = null;
let currentOnProgress: ((percent: number) => void) | undefined;

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("vie", 1, {
          workerPath: "/tesseract/worker.min.js",
          corePath: "/tesseract/core",
          langPath: "/tesseract/lang-data",
          logger: (message) => {
            if (message.status === "recognizing text") {
              currentOnProgress?.(Math.round(message.progress * 100));
            }
          },
        });
        activeWorker = worker;
        return worker;
      } catch (error) {
        // Reset so the next call gets a fresh attempt instead of reusing a
        // permanently-rejected promise (e.g. after a network hiccup).
        workerPromise = null;
        throw error;
      }
    })();
  }
  return workerPromise;
}

/**
 * Terminates the in-flight/cached Tesseract worker (if any) and resets the
 * module-level singleton so a cancelled scan doesn't leave a stale worker or
 * a stale cached promise behind. Safe to call even if no scan is running.
 */
export async function cancelReceiptRecognition(): Promise<void> {
  if (activeWorker) {
    await activeWorker.terminate();
    activeWorker = null;
  }
  workerPromise = null;
  currentOnProgress = undefined;
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
