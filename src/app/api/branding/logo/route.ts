import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { jsonError, jsonOk, withAdmin } from "@/lib/api";
import {
  ALLOWED_LOGO_MIME,
  deleteLogo,
  getBrandingMeta,
  getLogoFilePath,
  hasCustomLogo,
  LOGO_MAX_BYTES,
  saveLogo,
} from "@/lib/branding";

export const dynamic = "force-dynamic";

/** Unauthenticated so login/setup can show the custom logo before a session exists. */
export async function GET() {
  const meta = getBrandingMeta();
  const filePath = getLogoFilePath();
  if (!meta || !filePath) {
    return new NextResponse(null, { status: 404 });
  }
  const body = fs.readFileSync(filePath);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": meta.mimeType,
      "Cache-Control": "public, max-age=60",
    },
  });
}

export async function POST(req: NextRequest) {
  return withAdmin(async () => {
    const form = await req.formData();
    const file = form.get("logo");
    if (!(file instanceof File)) {
      return jsonError("logo file is required");
    }
    const mimeType = file.type;
    if (!ALLOWED_LOGO_MIME[mimeType]) {
      return jsonError(
        "Unsupported type. Use PNG, JPEG, or WebP.",
      );
    }
    if (file.size > LOGO_MAX_BYTES) {
      return jsonError("Logo exceeds 2MB limit");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const meta = saveLogo(buffer, mimeType);
    return jsonOk({ ok: true, hasCustomLogo: true, meta });
  });
}

export async function DELETE() {
  return withAdmin(async () => {
    const removed = deleteLogo();
    return jsonOk({ ok: true, hasCustomLogo: false, removed });
  });
}

export async function HEAD() {
  if (!hasCustomLogo()) {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(null, { status: 200 });
}
