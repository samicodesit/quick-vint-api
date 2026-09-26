import { Upload } from "tus-js-client";
import { captureQueue, type PendingPhoto } from "./queue";

export type CaptureTransport = {
  manifest(photo: PendingPhoto): Promise<{ uploadId: string }>;
  sign(
    uploadId: string,
  ): Promise<{
    path: string;
    signature: string;
    tusEndpoint: string;
    state: string;
  }>;
  complete(uploadId: string, checksum: string): Promise<unknown>;
};

export async function digestFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function transferPhoto(
  photo: PendingPhoto,
  transport: CaptureTransport,
  onStatus: (text: string) => void,
) {
  if (!navigator.onLine) {
    onStatus("Saved on this device. Waiting for a connection.");
    return;
  }
  try {
    let uploadId = photo.uploadId;
    if (!uploadId) {
      uploadId = (await transport.manifest(photo)).uploadId;
      photo = { ...photo, uploadId, state: "uploading" };
      await captureQueue.put(photo);
    }
    const signature = await transport.sign(uploadId);
    if (signature.state !== "available") {
      await new Promise<void>((resolve, reject) => {
        const upload = new Upload(photo.file, {
          endpoint: signature.tusEndpoint,
          headers: { "x-signature": signature.signature },
          chunkSize: 6 * 1024 * 1024,
          retryDelays: [0, 1000, 3000, 5000],
          removeFingerprintOnSuccess: true,
          fingerprint: async () => `autolister:${uploadId}`,
          metadata: {
            bucketName: "ops-originals",
            objectName: signature.path,
            contentType: photo.file.type || "image/heic",
            cacheControl: "3600",
          },
          onError: reject,
          onSuccess: () => resolve(),
          onProgress: (sent, total) =>
            onStatus(
              `Uploading ${Math.round((sent / total) * 100)}%. This photo is not server-saved yet.`,
            ),
        });
        void upload
          .findPreviousUploads()
          .then((previous) => {
            if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
            upload.start();
          })
          .catch(reject);
      });
    }
    await transport.complete(uploadId, photo.sha256);
    await captureQueue.remove(photo.id);
    onStatus("Verified and saved to this item.");
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "Transfer failed";
    await captureQueue.put({ ...photo, state: "failed", error });
    onStatus(`Saved on this device. Upload needs retry: ${error}`);
  }
}
