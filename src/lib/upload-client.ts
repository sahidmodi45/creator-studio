"use client";

import { guessCategory, type AssetCategory, type ContentAssetRole } from "@/lib/constants";
import { titleFromFileName } from "@/lib/format";

export type UploadMeta = {
  workspaceId: string;
  title?: string;
  description?: string;
  category?: AssetCategory;
  tags?: string[];
  internalNotes?: string;
  visibility?: "shared" | "internal";
  contentItemId?: string | null;
  requestId?: string | null;
  role?: ContentAssetRole | null;
};

type Probe = { width?: number; height?: number; durationSeconds?: number; thumbnail?: Blob };

const THUMB_MAX = 900;

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob | undefined>((resolve) => canvas.toBlob((blob) => resolve(blob ?? undefined), "image/jpeg", 0.82));
}

function drawScaled(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, THUMB_MAX / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function probeImage(file: File): Promise<Probe> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("unreadable"));
      image.src = url;
    });
    const canvas = drawScaled(image, image.naturalWidth, image.naturalHeight);
    return { width: image.naturalWidth, height: image.naturalHeight, thumbnail: await canvasToJpeg(canvas) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function probeVideo(file: File): Promise<Probe> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("unreadable"));
      setTimeout(() => reject(new Error("timeout")), 20_000);
    });
    const result: Probe = {
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined,
      durationSeconds: Number.isFinite(video.duration) ? video.duration : undefined,
    };
    // A moment in, so the frame is not the black fade at the very start.
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = Math.min(1, (video.duration || 2) / 2);
      setTimeout(resolve, 8_000);
    });
    if (video.videoWidth) result.thumbnail = await canvasToJpeg(drawScaled(video, video.videoWidth, video.videoHeight));
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function probeAudio(file: File): Promise<Probe> {
  const url = URL.createObjectURL(file);
  try {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = url;
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error("unreadable"));
      setTimeout(() => reject(new Error("timeout")), 10_000);
    });
    return { durationSeconds: Number.isFinite(audio.duration) ? audio.duration : undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Reads size, length and a cover frame in the browser. Some formats cannot be read, and that is fine: the file still uploads. */
async function probe(file: File): Promise<Probe> {
  try {
    if (file.type.startsWith("image/")) return await probeImage(file);
    if (file.type.startsWith("video/") || /\.(mov|m4v|mp4|webm)$/i.test(file.name)) return await probeVideo(file);
    if (file.type.startsWith("audio/")) return await probeAudio(file);
  } catch {
    /* preview is optional */
  }
  return {};
}

function putWithProgress(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("The file could not be saved.")));
    xhr.onerror = () => reject(new Error("The connection dropped during the upload."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(body);
  });
}

/**
 * Full upload: announce it, send the bytes straight to storage, then have the
 * server confirm they arrived. Resolves to the new asset id only after that check.
 */
export async function uploadFile(
  file: File,
  meta: UploadMeta,
  onProgress: (fraction: number) => void = () => {},
  signal?: AbortSignal,
) {
  const info = await probe(file);

  const initResponse = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: meta.workspaceId,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      category: meta.category ?? guessCategory(file),
      title: meta.title?.trim() || titleFromFileName(file.name),
      description: meta.description ?? "",
      tags: meta.tags ?? [],
      internalNotes: meta.internalNotes ?? "",
      visibility: meta.visibility,
      contentItemId: meta.contentItemId ?? null,
      requestId: meta.requestId ?? null,
      role: meta.role ?? null,
      withThumbnail: !!info.thumbnail,
    }),
  });
  if (!initResponse.ok) {
    const failure = await initResponse.json().catch(() => ({}));
    throw new Error(failure.error ?? "The upload could not start.");
  }
  const { assetId, put, thumbPut } = await initResponse.json();

  await putWithProgress(put.url, put.headers, file, onProgress, signal);

  let thumbnailUploaded = false;
  if (thumbPut && info.thumbnail) {
    try {
      await putWithProgress(thumbPut.url, thumbPut.headers, info.thumbnail, () => {}, signal);
      thumbnailUploaded = true;
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
    }
  }

  const completeResponse = await fetch(`/api/uploads/${assetId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      width: info.width ?? null,
      height: info.height ?? null,
      durationSeconds: info.durationSeconds ?? null,
      thumbnailUploaded,
      contentItemId: meta.contentItemId ?? null,
      role: meta.role ?? null,
    }),
  });
  if (!completeResponse.ok) {
    const failure = await completeResponse.json().catch(() => ({}));
    throw new Error(failure.error ?? "The upload could not be confirmed.");
  }
  return assetId as string;
}
