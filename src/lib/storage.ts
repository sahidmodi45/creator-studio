import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type SignedPut = { url: string; headers: Record<string, string> };

export interface StorageDriver {
  /** A short-lived address the browser sends the file to. */
  signPut(key: string, contentType: string, maxBytes: number): Promise<SignedPut>;
  /** Byte size of a stored object, or null if it does not exist. */
  size(key: string): Promise<number | null>;
  /** An address the browser or ffmpeg can read from directly, when the driver has one. */
  signGet(key: string, options?: { downloadName?: string; contentType?: string }): Promise<string | null>;
  /** Reads bytes on the server. Used by the AI assistant to look at images. */
  readBuffer(key: string): Promise<Buffer>;
}

const SIGNED_URL_SECONDS = 6 * 60 * 60;

function secret() {
  const value = process.env.APP_SECRET;
  if (!value) throw new Error("APP_SECRET is not set");
  return value;
}

/* ------------------------------------------------------------ local disk */

function localRoot() {
  // turbopackIgnore: the local disk is only used on a laptop. Without it the build traces the whole project.
  return path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage");
}

export function localPathFor(key: string) {
  const root = localRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

function signLocal(key: string, expires: number, maxBytes: number) {
  return createHmac("sha256", secret()).update(`${key}\n${expires}\n${maxBytes}`).digest("base64url");
}

export function verifyLocalPut(key: string, expires: number, maxBytes: number, signature: string) {
  if (!Number.isFinite(expires) || expires < Date.now() / 1000) return false;
  const expected = Buffer.from(signLocal(key, expires, maxBytes));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Writes an incoming body to disk. Goes through a temp file so a broken upload leaves nothing behind. */
export async function writeLocal(key: string, body: ReadableStream<Uint8Array>, maxBytes: number) {
  const target = localPathFor(key);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.part`;
  let written = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      written += chunk.length;
      if (written > maxBytes) done(new Error("File is larger than allowed"));
      else done(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as never), limiter, createWriteStream(temp));
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  return written;
}

export function openLocal(key: string, range?: { start: number; end: number }) {
  return createReadStream(/*turbopackIgnore: true*/ localPathFor(key), range);
}

const localDriver: StorageDriver = {
  async signPut(key, _contentType, maxBytes) {
    const expires = Math.floor(Date.now() / 1000) + SIGNED_URL_SECONDS;
    const query = new URLSearchParams({
      k: key,
      e: String(expires),
      m: String(maxBytes),
      s: signLocal(key, expires, maxBytes),
    });
    return { url: `/api/storage/put?${query}`, headers: {} };
  },
  async size(key) {
    try {
      return (await stat(/*turbopackIgnore: true*/ localPathFor(key))).size;
    } catch {
      return null;
    }
  },
  async signGet() {
    return null;
  },
  async readBuffer(key) {
    const { readFile } = await import("node:fs/promises");
    return readFile(/*turbopackIgnore: true*/ localPathFor(key));
  },
};

/* --------------------------------------------------- any S3-style service */

let s3Client: S3Client | null = null;

function s3() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: !!process.env.S3_ENDPOINT,
      // Otherwise the SDK signs a checksum of an empty body into upload links, and real uploads get rejected.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return s3Client;
}

function bucket() {
  const value = process.env.S3_BUCKET;
  if (!value) throw new Error("S3_BUCKET is not set");
  return value;
}

const s3Driver: StorageDriver = {
  async signPut(key, contentType) {
    const url = await getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), {
      expiresIn: SIGNED_URL_SECONDS,
    });
    return { url, headers: { "Content-Type": contentType } };
  },
  async size(key) {
    try {
      const head = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
      return head.ContentLength ?? null;
    } catch {
      return null;
    }
  },
  async signGet(key, options) {
    return getSignedUrl(
      s3(),
      new GetObjectCommand({
        Bucket: bucket(),
        Key: key,
        ResponseContentType: options?.contentType,
        ResponseContentDisposition: options?.downloadName ? contentDisposition(options.downloadName, true) : undefined,
      }),
      { expiresIn: 15 * 60 },
    );
  },
  async readBuffer(key) {
    const object = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return Buffer.from(await object.Body!.transformToByteArray());
  },
};

export function contentDisposition(fileName: string, attachment: boolean) {
  const safe = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${attachment ? "attachment" : "inline"}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Which file storage is connected. "off" means none: uploads show "Uploads coming soon"
 * and nothing is ever written to this server's disk. That is the setting on Netlify until
 * Google Drive is connected. Unset means "local" on a laptop and "off" in production.
 */
export function storageDriverName(): "local" | "s3" | "off" {
  const value = (process.env.STORAGE_DRIVER ?? "").trim().toLowerCase();
  if (value === "s3" || value === "local" || value === "off") return value;
  return process.env.NODE_ENV === "production" && process.env.NETLIFY ? "off" : "local";
}

export function uploadsEnabled() {
  return storageDriverName() !== "off";
}

export function isLocalStorage() {
  return storageDriverName() === "local";
}

const offDriver: StorageDriver = {
  async signPut() {
    throw new Error("Uploads coming soon");
  },
  async size() {
    return null;
  },
  async signGet() {
    return null;
  },
  async readBuffer() {
    throw new Error("File storage is not connected");
  },
};

export function storage(): StorageDriver {
  const name = storageDriverName();
  return name === "s3" ? s3Driver : name === "local" ? localDriver : offDriver;
}
