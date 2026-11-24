import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const BRANDING_DIR = path.join(DATA_DIR, "branding");
const META_PATH = path.join(BRANDING_DIR, "meta.json");

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Raster only — SVG is rejected to avoid stored XSS via scripted SVGs. */
export const ALLOWED_LOGO_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export type BrandingMeta = {
  filename: string;
  mimeType: string;
  updatedAt: string;
};

function ensureBrandingDir() {
  fs.mkdirSync(BRANDING_DIR, { recursive: true });
}

export function getBrandingMeta(): BrandingMeta | null {
  try {
    if (!fs.existsSync(META_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(META_PATH, "utf8")) as BrandingMeta;
    if (!raw?.filename || !raw?.mimeType) return null;
    // Ignore legacy SVG uploads (no longer allowed).
    if (!ALLOWED_LOGO_MIME[raw.mimeType]) return null;
    const filePath = path.join(BRANDING_DIR, path.basename(raw.filename));
    if (!fs.existsSync(filePath)) return null;
    return { ...raw, filename: path.basename(raw.filename) };
  } catch {
    return null;
  }
}

export function hasCustomLogo(): boolean {
  return getBrandingMeta() !== null;
}

export function getLogoFilePath(): string | null {
  const meta = getBrandingMeta();
  if (!meta) return null;
  return path.join(BRANDING_DIR, meta.filename);
}

export function saveLogo(buffer: Buffer, mimeType: string): BrandingMeta {
  const ext = ALLOWED_LOGO_MIME[mimeType];
  if (!ext) {
    throw new Error("Unsupported logo type");
  }
  if (buffer.length > LOGO_MAX_BYTES) {
    throw new Error("Logo exceeds 2MB limit");
  }

  ensureBrandingDir();
  clearLogoFiles();

  const filename = `logo${ext}`;
  const filePath = path.join(BRANDING_DIR, filename);
  fs.writeFileSync(filePath, buffer);

  const meta: BrandingMeta = {
    filename,
    mimeType,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

export function deleteLogo(): boolean {
  const existed = hasCustomLogo();
  clearLogoFiles();
  if (fs.existsSync(META_PATH)) {
    fs.unlinkSync(META_PATH);
  }
  return existed;
}

function clearLogoFiles() {
  if (!fs.existsSync(BRANDING_DIR)) return;
  for (const name of fs.readdirSync(BRANDING_DIR)) {
    if (name === "meta.json") continue;
    if (name.startsWith("logo.")) {
      fs.unlinkSync(path.join(BRANDING_DIR, name));
    }
  }
}
