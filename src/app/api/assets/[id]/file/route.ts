import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { assets } from "@/db/schema";
import { getAccessById } from "@/lib/auth";
import { contentDisposition, isLocalStorage, openLocal, storage } from "@/lib/storage";

/** Types a browser may show inline. Anything else (HTML, SVG, unknown) only ever downloads, so an upload cannot run as a page here. */
function safeInline(mime: string) {
  if (mime === "image/svg+xml") return false;
  return /^(image|video|audio)\//.test(mime) || mime === "application/pdf";
}

async function serve(request: NextRequest, id: string, headOnly: boolean) {
  const [asset] = await db.select().from(assets).where(eq(assets.id, id));
  if (!asset || asset.deletedAt || !asset.storageKey) return new NextResponse("Not found", { status: 404 });

  const access = await getAccessById(asset.workspaceId);
  if (!access) return new NextResponse("Not found", { status: 404 });
  // The file itself is what a client must not reach before release, so the check lives here.
  if (!access.isTeam && asset.visibility === "internal") return new NextResponse("Not found", { status: 404 });

  const wantsThumb = request.nextUrl.searchParams.get("variant") === "thumb";
  const wantsDownload = request.nextUrl.searchParams.get("download") === "1";

  const key = wantsThumb ? asset.thumbnailKey : asset.storageKey;
  if (!key) return new NextResponse("Not found", { status: 404 });

  const mime = wantsThumb ? "image/jpeg" : (asset.mimeType ?? "application/octet-stream");
  const fileName = asset.fileName ?? asset.title;
  const attachment = wantsDownload || !safeInline(mime);
  const disposition = contentDisposition(fileName, attachment);
  const contentType = attachment && !wantsDownload ? "application/octet-stream" : mime;

  if (!isLocalStorage()) {
    const url = await storage().signGet(key, { downloadName: attachment ? fileName : undefined, contentType });
    // No storage connected (STORAGE_DRIVER=off): there is no file to send.
    if (!url) return new NextResponse("Not found", { status: 404 });
    return NextResponse.redirect(url, 302);
  }

  const size = await storage().size(key);
  if (size == null) return new NextResponse("Not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": disposition,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });

  // Range requests are what make video seeking work, and Safari will not play video without them.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      headers.set("Content-Range", `bytes */${size}`);
      return new NextResponse(null, { status: 416, headers });
    }
    start = Math.max(0, start);
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    if (headOnly) return new NextResponse(null, { status: 206, headers });
    return new NextResponse(Readable.toWeb(openLocal(key, { start, end })) as ReadableStream, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  if (headOnly) return new NextResponse(null, { status: 200, headers });
  return new NextResponse(Readable.toWeb(openLocal(key)) as ReadableStream, { status: 200, headers });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return serve(request, (await params).id, false);
}

export async function HEAD(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return serve(request, (await params).id, true);
}
