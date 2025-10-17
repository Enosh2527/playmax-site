import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Lock,
  LogIn,
  UserPlus,
  Database,
  FileText,
  Folder,
  Link2,
  Download,
  Trash2,
  PencilLine,
  Users,
  ShieldCheck,
  LogOut,
  ArrowLeft,
  ChevronRight,
  UploadCloud,
  MoreHorizontal,
  Layers,
  Cloud,
  Search,
  SlidersHorizontal,
  ChevronDown,
  X,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Badge } from "./components/ui/badge";

const initialAllowedEmails = ["admin@vaulthub.dev", "rajhanoch24@gmail.com"].map((email) =>
  email.toLowerCase()
);
const initialUsers = [
  {
    id: "admin",
    name: "Vault Admin",
    email: "admin@vaulthub.dev",
    password: "admin123",
    role: "admin",
  },
  {
    id: "rajhanoch24",
    name: "Raj Hanoch",
    email: "rajhanoch24@gmail.com",
    password: "raj_admin123",
    role: "admin",
  },
];
const protectedAdminEmails = new Set(
  initialUsers.map((user) => user.email.toLowerCase())
);

const categories = [
  { id: "prompts", label: "Prompts", icon: FileText, accent: "from-[#238636] to-[#2ea043]" },
  { id: "scripts", label: "Scripts", icon: Layers, accent: "from-[#1f6feb] to-[#388bfd]" },
  { id: "links", label: "Links", icon: Link2, accent: "from-[#bf3989] to-[#f778ba]" },
];

const TAB_LABELS = {
  prompts: "Prompts",
  scripts: "Scripts",
  links: "Links",
  bin: "Bin",
};

const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const VAULT_STORE_FUNCTION = "/api/vault-store";
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

async function vaultRequest(path, { method = "GET", body, signal } = {}) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const maxAttempts = normalizedMethod === "GET" ? 3 : 2;
  let attempt = 0;
  let lastError = null;

  const attemptRequest = async () => {
    const response = await fetch(VAULT_STORE_FUNCTION, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, method: normalizedMethod, body }),
    });

    const contentType = response.headers.get("Content-Type") || "";
    const rawText = await response.text();

    if (!response.ok) {
      let message = rawText || "Storage request failed.";
      try {
        const parsed = JSON.parse(rawText);
        if (parsed?.error) {
          message = parsed.error;
        }
      } catch (error) {
        // Ignore JSON parse failures – fall back to raw text.
      }
      const storageError = new Error(message);
      storageError.status = response.status;
      throw storageError;
    }

    if (!rawText || !rawText.trim()) {
      return null;
    }

    if (/application\/json/i.test(contentType)) {
      try {
        return JSON.parse(rawText);
      } catch (error) {
        console.warn("Failed to parse storage JSON response", error);
        return null;
      }
    }

    return rawText;
  };

  while (attempt < maxAttempts) {
    try {
      return await attemptRequest();
    } catch (error) {
      lastError = error;
      if (error?.name === "AbortError") {
        throw error;
      }
      const status = error?.status;
      const retryable = typeof status === "number" ? RETRYABLE_STATUS_CODES.has(status) : true;
      if (attempt + 1 >= maxAttempts || !retryable) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
    attempt += 1;
  }

  throw lastError ?? new Error("Storage request failed.");
}

const STORAGE_POINTER_PREFIX = "r2://";

const encodeStoragePointer = (key) =>
  typeof key === "string" && key.length > 0 ? `${STORAGE_POINTER_PREFIX}${key}` : null;

const decodeStoragePointer = (value) =>
  typeof value === "string" && value.startsWith(STORAGE_POINTER_PREFIX)
    ? value.slice(STORAGE_POINTER_PREFIX.length)
    : null;

async function requestPresignedUrl(action, key, contentType) {
  if (!action || !key) {
    throw new Error("Missing action or key for R2 request.");
  }
  const response = await fetch("/api/presign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, key, contentType }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to request presigned ${action} URL.`);
  }
  const data = await response.json();
  if (!data?.url) {
    throw new Error("Presigned URL response missing url property.");
  }
  return data.url;
}

function uint8ArrayToBase64(bytes) {
  if (!bytes || !bytes.length) {
    return "";
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode(...chunk);
    }
    return window.btoa(binary);
  }
  throw new Error("Base64 encoding is not supported in this environment.");
}

async function proxyUploadFileToR2({ key, file, contentType }) {
  if (!file) {
    throw new Error("No file provided for R2 upload.");
  }
  if (typeof file.arrayBuffer !== "function") {
    throw new Error("File does not support arrayBuffer().");
  }
  const buffer = await file.arrayBuffer();
  const base64 = uint8ArrayToBase64(new Uint8Array(buffer));
  const response = await fetch("/api/presign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "proxy-upload",
      key,
      contentType,
      data: base64,
      encoding: "base64",
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to upload file to R2 via proxy.");
  }
  const payload = await response.json().catch(() => ({}));
  if (payload?.error) {
    throw new Error(payload.error);
  }
  return key;
}

async function uploadFileToR2({ key, file, contentType }) {
  if (!file) {
    throw new Error("No file provided for R2 upload.");
  }
  const resolvedContentType = contentType || file.type || "application/octet-stream";
  try {
    const url = await requestPresignedUrl("upload", key, resolvedContentType);
    const uploadResponse = await fetch(url, {
      method: "PUT",
      headers: resolvedContentType ? { "Content-Type": resolvedContentType } : {},
      body: file,
    });
    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload file to R2 (status ${uploadResponse.status}).`);
    }
    return key;
  } catch (error) {
    const message = typeof error?.message === "string" ? error.message : "";
    const shouldFallback =
      error?.name === "TypeError" || /failed to fetch/i.test(message) || /status\s(4|5)\d{2}/i.test(message);
    if (!shouldFallback) {
      throw error;
    }
    try {
      return await proxyUploadFileToR2({ key, file, contentType: resolvedContentType });
    } catch (proxyError) {
      proxyError.cause = error;
      throw proxyError;
    }
  }
}

async function downloadPointerToUint8Array(key) {
  if (!key) {
    throw new Error("Missing R2 key for download.");
  }
  const url = await requestPresignedUrl("download", key);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download R2 object (status ${response.status}).`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

const textEncoder = new TextEncoder();

function base64ToUint8Array(base64) {
  if (!base64) {
    return new Uint8Array(0);
  }
  if (typeof window === "undefined" && typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const decoder =
    (typeof window !== "undefined" && window.atob) ||
    (typeof globalThis !== "undefined" && globalThis.atob);
  if (!decoder) {
    throw new Error("Base64 decoding is not supported in this environment.");
  }
  const binary = decoder(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const parseStorageValue = (value) => {
  const key = decodeStoragePointer(value);
  if (key) {
    return { key, legacyContent: null };
  }
  return {
    key: null,
    legacyContent: typeof value === "string" && value.length ? value : null,
  };
};

async function loadStorageBinary(value) {
  const { key, legacyContent } = parseStorageValue(value);
  if (key) {
    return downloadPointerToUint8Array(key);
  }
  if (legacyContent) {
    return base64ToUint8Array(legacyContent);
  }
  return new Uint8Array(0);
}

async function prepareReferenceFile(file, { category, ownerId }) {
  if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
    return null;
  }
  if (!file.size) {
    return null;
  }
  if (!category || !ownerId) {
    throw new Error("Missing category or owner when preparing reference file.");
  }
  const key = `${category}/${ownerId}/reference/${Date.now()}-${safeFileName(
    file.name || "reference"
  )}`;
  await uploadFileToR2({
    key,
    file,
    contentType: file.type || "application/octet-stream",
  });
  return {
    name: file.name || "reference",
    mime: file.type || "application/octet-stream",
    size: Number(file.size || 0),
    content: encodeStoragePointer(key),
    key,
  };
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0 ^ -1;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function dateToDos(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = textEncoder.encode(entry.path);
    const data = entry.data;
    const { dosTime, dosDate } = dateToDos(entry.date ?? new Date());

    const header = new ArrayBuffer(30);
    const view = new DataView(header);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, entry.crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    localParts.push(new Uint8Array(header));
    localParts.push(nameBytes);
    localParts.push(data);

    const centralHeader = new ArrayBuffer(46);
    const centralView = new DataView(centralHeader);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, entry.crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, entry.externalAttr ?? (entry.isDirectory ? 0x10 << 16 : 0), true);
    centralView.setUint32(42, offset, true);
    centralParts.push(new Uint8Array(centralHeader));
    centralParts.push(nameBytes);

    offset += 30 + nameBytes.length + data.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const centralOffset = offset;
  const end = new ArrayBuffer(22);
  const endView = new DataView(end);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, new Uint8Array(end)], {
    type: "application/zip",
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 500);
}

function safeFileName(name, extension = "") {
  const cleaned = name.replace(/[^a-z0-9-_.\s]/gi, "-").trim().replace(/\s+/g, "-");
  const ext = extension ? (extension.startsWith(".") ? extension : `.${extension}`) : "";
  return `${cleaned || "untitled"}${ext}`;
}

function formatFileSize(bytes) {
  const value = Number(bytes);
  if (Number.isNaN(value) || value < 0) {
    return "Unknown size";
  }
  if (value === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const precision = size >= 10 || index === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[index]}`;
}

function formatDateTime(iso) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeSearchValue(value) {
  return String(value || "").toLowerCase();
}

function matchesQueryField(value, query) {
  if (!query) {
    return true;
  }
  return normalizeSearchValue(value).includes(query);
}

function promptMatchesSearch(item, query) {
  if (!query) {
    return true;
  }
  return (
    matchesQueryField(item.name, query) ||
    matchesQueryField(item.description, query) ||
    matchesQueryField(item.notes, query) ||
    matchesQueryField(item.uploader, query) ||
    matchesQueryField(item.uploaderEmail, query)
  );
}

function linkMatchesSearch(item, query) {
  if (!query) {
    return true;
  }
  return (
    matchesQueryField(item.name, query) ||
    matchesQueryField(item.url, query) ||
    matchesQueryField(item.notes, query) ||
    matchesQueryField(item.uploader, query) ||
    matchesQueryField(item.uploaderEmail, query)
  );
}

function scriptMatchesSearch(item, query, pathLabel = "") {
  if (!query) {
    return true;
  }
  return (
    matchesQueryField(item.name, query) ||
    matchesQueryField(item.originalName, query) ||
    matchesQueryField(item.notes, query) ||
    matchesQueryField(item.uploader, query) ||
    matchesQueryField(item.uploaderEmail, query) ||
    matchesQueryField(pathLabel, query)
  );
}

function formatTrashTimeRemaining(deletedAt) {
  if (!deletedAt) return "Scheduled for removal";
  const deletedTime = new Date(deletedAt).getTime();
  if (Number.isNaN(deletedTime)) return "Scheduled for removal";
  const expiry = deletedTime + TRASH_RETENTION_MS;
  const diff = expiry - Date.now();
  if (diff <= 0) return "Removing soon";
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const minuteMs = 60 * 1000;
  const days = Math.floor(diff / dayMs);
  const hours = Math.floor((diff % dayMs) / hourMs);
  const minutes = Math.floor((diff % hourMs) / minuteMs);
  if (days > 0) {
    return `${days} day${days === 1 ? "" : "s"}${hours > 0 ? ` ${hours}h` : ""} left`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }
  return `${Math.max(minutes, 1)}m left`;
}

function ScriptBreadcrumb({ breadcrumbs, onNavigate }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm text-slate-300">
      {breadcrumbs.map((crumb, index) => (
        <React.Fragment key={crumb.id ?? "root"}>
          {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
          <button
            onClick={() => onNavigate(crumb.id)}
            className={`rounded-md px-2 py-1 transition ${
              crumb.active ? "bg-[#238636]/20 text-[#3fb950]" : "hover:bg-[#161b22]"
            }`}
          >
            {crumb.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-[#30363d] bg-[#0d1117] p-10 text-center text-slate-300">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#161b22] text-white">
        <Icon className="h-8 w-8" />
      </div>
      <div>
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <p className="mt-1 max-w-md text-sm text-slate-400">{description}</p>
      </div>
    </div>
  );
}

const ALLOWED_EMAILS_KEY = "vaulthub-allowed-emails";
const USERS_KEY = "vaulthub-users";
const CURRENT_USER_KEY = "vaulthub-active-user";

const defaultVaultSchema = {
  allowed_emails: {
    table: "allowed_emails",
    columns: {
      email: "email",
      role: "role",
      created_at: "created_at",
    },
  },
  prompts: {
    table: "prompts",
    columns: {
      id: "id",
      name: "name",
      description: "description",
      notes: "notes",
      uploader: "uploader",
      uploader_email: "uploader_email",
      created_at: "created_at",
      deleted_at: "deleted_at",
      reference_name: "reference_name",
      reference_mime: "reference_mime",
      reference_size: "reference_size",
      reference_content: "reference_content",
    },
  },
  links: {
    table: "links",
    columns: {
      id: "id",
      name: "name",
      url: "url",
      notes: "notes",
      uploader: "uploader",
      uploader_email: "uploader_email",
      created_at: "created_at",
      deleted_at: "deleted_at",
      reference_name: "reference_name",
      reference_mime: "reference_mime",
      reference_size: "reference_size",
      reference_content: "reference_content",
    },
  },
  scripts: {
    table: "scripts",
    columns: {
      id: "id",
      type: "type",
      name: "name",
      original_name: "original_name",
      notes: "notes",
      uploader: "uploader",
      uploader_email: "uploader_email",
      created_at: "created_at",
      parent_id: "parent_id",
      file_mime: "file_mime",
      file_size: "file_size",
      file_content: "file_content",
      deleted_at: "deleted_at",
      reference_name: "reference_name",
      reference_mime: "reference_mime",
      reference_size: "reference_size",
      reference_content: "reference_content",
    },
  },
};

const columnSynonyms = {
  email: ["email_address", "user_email"],
  role: ["permission", "access_level"],
  name: ["title", "label", "filename"],
  description: ["details", "summary", "prompt_description"],
  notes: ["note", "remarks", "info"],
  uploader: ["uploaded_by", "author", "owner"],
  uploader_email: ["uploaderEmail", "email", "owner_email"],
  created_at: ["createdAt", "created_on", "timestamp"],
  url: ["link", "href", "target"],
  type: ["entry_type", "kind"],
  original_name: ["originalName", "original", "source_name"],
  parent_id: ["parent", "folder_id", "parentId"],
  file_mime: ["mime", "mimetype", "content_type"],
  file_size: ["size", "filesize", "content_length"],
  file_content: ["content", "data", "payload"],
  reference_name: ["reference", "reference_name", "helper_file"],
  reference_mime: ["reference_mime", "helper_mime"],
  reference_size: ["reference_size", "helper_size"],
  reference_content: ["reference_content", "helper_content", "reference_data"],
};

const optionalColumns = {
  allowed_emails: new Set(["role", "created_at"]),
  prompts: new Set([
    "description",
    "notes",
    "deleted_at",
    "reference_name",
    "reference_mime",
    "reference_size",
    "reference_content",
  ]),
  links: new Set([
    "notes",
    "deleted_at",
    "reference_name",
    "reference_mime",
    "reference_size",
    "reference_content",
  ]),
  scripts: new Set([
    "notes",
    "original_name",
    "parent_id",
    "file_mime",
    "file_size",
    "file_content",
    "deleted_at",
    "reference_name",
    "reference_mime",
    "reference_size",
    "reference_content",
  ]),
};

const PROMPT_FALLBACK_TOKEN = "__vaulthub_prompt";
const PROMPT_FALLBACK_VERSION = 2;

const LINK_FALLBACK_TOKEN = "__vaulthub_link";
const LINK_FALLBACK_VERSION = 1;

const SCRIPT_FALLBACK_TOKEN = "__vaulthub_script";
const SCRIPT_FALLBACK_VERSION = 1;

const normaliseReferenceData = (input = {}) => {
  if (!input) {
    return null;
  }
  const name = input.name ?? input.reference_name ?? null;
  const mime = input.mime ?? input.reference_mime ?? null;
  const size =
    input.size !== undefined
      ? input.size
      : input.reference_size !== undefined
      ? input.reference_size
      : null;
  const rawContent = input.content ?? input.reference_content ?? null;
  const { key, legacyContent } = parseStorageValue(rawContent);
  if (!name && !mime && !size && !key && !legacyContent) {
    return null;
  }
  return {
    name,
    mime,
    size,
    content: rawContent,
    key,
    legacyContent,
  };
};

const encodePromptFallback = ({
  description = "",
  notes = "",
  deleted_at = null,
  reference = null,
} = {}) =>
  JSON.stringify({
    [PROMPT_FALLBACK_TOKEN]: PROMPT_FALLBACK_VERSION,
    description,
    notes,
    deleted_at,
    reference: reference ? { ...reference } : null,
  });

const decodePromptFallback = (value) => {
  if (typeof value !== "string" || !value.trim().startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (parsed[PROMPT_FALLBACK_TOKEN] === 1) {
      return {
        description: typeof parsed.description === "string" ? parsed.description : "",
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
        deleted_at: null,
        reference: null,
      };
    }
    if (parsed[PROMPT_FALLBACK_TOKEN] !== PROMPT_FALLBACK_VERSION) {
      return null;
    }
    return {
      description: typeof parsed.description === "string" ? parsed.description : "",
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      deleted_at: parsed.deleted_at ?? null,
      reference: normaliseReferenceData(parsed.reference),
    };
  } catch (error) {
    return null;
  }
};

const encodeLinkFallback = ({ notes = "", deleted_at = null, reference = null } = {}) =>
  JSON.stringify({
    [LINK_FALLBACK_TOKEN]: LINK_FALLBACK_VERSION,
    notes,
    deleted_at,
    reference: reference ? { ...reference } : null,
  });

const decodeLinkFallback = (value) => {
  if (typeof value !== "string" || !value.trim().startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || parsed[LINK_FALLBACK_TOKEN] !== LINK_FALLBACK_VERSION) {
      return null;
    }
    return {
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      deleted_at: parsed.deleted_at ?? null,
      reference: normaliseReferenceData(parsed.reference),
    };
  } catch (error) {
    return null;
  }
};

const encodeScriptFallback = ({ notes = "", deleted_at = null, reference = null } = {}) =>
  JSON.stringify({
    [SCRIPT_FALLBACK_TOKEN]: SCRIPT_FALLBACK_VERSION,
    notes,
    deleted_at,
    reference: reference ? { ...reference } : null,
  });

const decodeScriptFallback = (value) => {
  if (typeof value !== "string" || !value.trim().startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || parsed[SCRIPT_FALLBACK_TOKEN] !== SCRIPT_FALLBACK_VERSION) {
      return null;
    }
    return {
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      deleted_at: parsed.deleted_at ?? null,
      reference: normaliseReferenceData(parsed.reference),
    };
  } catch (error) {
    return null;
  }
};

const applyPromptFallbackColumns = (tableSchema, payload, canonical = {}, existingFallback = null) => {
  if (!tableSchema?.columns) {
    return payload;
  }
  const { columns } = tableSchema;
  const fallbackColumn = columns.notes ?? columns.description ?? null;
  if (!fallbackColumn) {
    return payload;
  }

  const needsDescriptionFallback = !columns.description && canonical.description !== undefined;
  const needsNotesFallback = !columns.notes && canonical.notes !== undefined;
  const needsDeletedFallback = !columns.deleted_at && canonical.deleted_at !== undefined;
  const hasReferenceInput =
    canonical.reference_name !== undefined ||
    canonical.reference_mime !== undefined ||
    canonical.reference_size !== undefined ||
    canonical.reference_content !== undefined;
  const needsReferenceFallback =
    (!columns.reference_name ||
      !columns.reference_mime ||
      !columns.reference_size ||
      !columns.reference_content) && hasReferenceInput;

  if (!needsDescriptionFallback && !needsNotesFallback && !needsDeletedFallback && !needsReferenceFallback) {
    return payload;
  }

  const base = {
    description:
      canonical.description !== undefined
        ? canonical.description ?? ""
        : existingFallback?.description ?? "",
    notes:
      canonical.notes !== undefined ? canonical.notes ?? "" : existingFallback?.notes ?? "",
    deleted_at:
      canonical.deleted_at !== undefined ? canonical.deleted_at : existingFallback?.deleted_at ?? null,
    reference: existingFallback?.reference ?? null,
  };

  if (hasReferenceInput) {
    base.reference = normaliseReferenceData({
      name: canonical.reference_name,
      mime: canonical.reference_mime,
      size: canonical.reference_size,
      content: canonical.reference_content,
    }) ?? base.reference;
  }

  payload[fallbackColumn] = encodePromptFallback(base);
  return payload;
};

const applyLinkFallbackColumns = (tableSchema, payload, canonical = {}, existingFallback = null) => {
  if (!tableSchema?.columns) {
    return payload;
  }
  const { columns } = tableSchema;
  const fallbackColumn = columns.notes ?? null;
  if (!fallbackColumn) {
    return payload;
  }

  const needsNotesFallback = !columns.notes && canonical.notes !== undefined;
  const needsDeletedFallback = !columns.deleted_at && canonical.deleted_at !== undefined;
  const hasReferenceInput =
    canonical.reference_name !== undefined ||
    canonical.reference_mime !== undefined ||
    canonical.reference_size !== undefined ||
    canonical.reference_content !== undefined;
  const needsReferenceFallback =
    (!columns.reference_name ||
      !columns.reference_mime ||
      !columns.reference_size ||
      !columns.reference_content) && hasReferenceInput;

  if (!needsNotesFallback && !needsDeletedFallback && !needsReferenceFallback) {
    return payload;
  }

  const base = {
    notes:
      canonical.notes !== undefined ? canonical.notes ?? "" : existingFallback?.notes ?? "",
    deleted_at:
      canonical.deleted_at !== undefined ? canonical.deleted_at : existingFallback?.deleted_at ?? null,
    reference: existingFallback?.reference ?? null,
  };

  if (hasReferenceInput) {
    base.reference = normaliseReferenceData({
      name: canonical.reference_name,
      mime: canonical.reference_mime,
      size: canonical.reference_size,
      content: canonical.reference_content,
    }) ?? base.reference;
  }

  payload[fallbackColumn] = encodeLinkFallback(base);
  return payload;
};

const applyScriptFallbackColumns = (tableSchema, payload, canonical = {}, existingFallback = null) => {
  if (!tableSchema?.columns) {
    return payload;
  }
  const { columns } = tableSchema;
  const fallbackColumn = columns.notes ?? null;
  if (!fallbackColumn) {
    return payload;
  }

  const needsNotesFallback = !columns.notes && canonical.notes !== undefined;
  const needsDeletedFallback = !columns.deleted_at && canonical.deleted_at !== undefined;
  const hasReferenceInput =
    canonical.reference_name !== undefined ||
    canonical.reference_mime !== undefined ||
    canonical.reference_size !== undefined ||
    canonical.reference_content !== undefined;
  const needsReferenceFallback =
    (!columns.reference_name ||
      !columns.reference_mime ||
      !columns.reference_size ||
      !columns.reference_content) && hasReferenceInput;

  if (!needsNotesFallback && !needsDeletedFallback && !needsReferenceFallback) {
    return payload;
  }

  const base = {
    notes:
      canonical.notes !== undefined ? canonical.notes ?? "" : existingFallback?.notes ?? "",
    deleted_at:
      canonical.deleted_at !== undefined ? canonical.deleted_at : existingFallback?.deleted_at ?? null,
    reference: existingFallback?.reference ?? null,
  };

  if (hasReferenceInput) {
    base.reference = normaliseReferenceData({
      name: canonical.reference_name,
      mime: canonical.reference_mime,
      size: canonical.reference_size,
      content: canonical.reference_content,
    }) ?? base.reference;
  }

  payload[fallbackColumn] = encodeScriptFallback(base);
  return payload;
};

function cloneSchema(schema) {
  const result = {};
  for (const [table, config] of Object.entries(schema)) {
    result[table] = {
      ...config,
      columns: { ...config.columns },
    };
  }
  return result;
}

const shapeVaultPayload = (tableSchema, canonical) => {
  const result = {};
  if (!tableSchema || !tableSchema.columns) {
    return { ...canonical };
  }
  for (const [logical, value] of Object.entries(canonical)) {
    const column = tableSchema.columns[logical];
    if (!column) continue;
    if (value === undefined) continue;
    result[column] = value;
  }
  return result;
};

const buildFilterPath = (tableSchema, columnKey, value) => {
  if (!tableSchema || !tableSchema.columns?.[columnKey]) {
    return `${tableSchema?.table ?? columnKey}?${columnKey}=eq.${encodeURIComponent(value)}`;
  }
  const column = tableSchema.columns[columnKey];
  return `${tableSchema.table}?${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`;
};

const buildInFilterPath = (tableSchema, columnKey, values = []) => {
  const table = tableSchema?.table ?? columnKey;
  const column = tableSchema?.columns?.[columnKey] ?? columnKey;
  const unique = Array.from(new Set(values.filter((value) => value !== undefined && value !== null)));
  if (!unique.length) {
    return `${table}?${encodeURIComponent(column)}=in.%28%29`;
  }
  const formatted = unique
    .map((value) => `"${String(value).replace(/"/g, '\\"')}"`)
    .join(",");
  return `${table}?${encodeURIComponent(column)}=in.${encodeURIComponent(`(${formatted})`)}`;
};

const getColumnName = (row, column) => {
  if (!column) return undefined;
  return row?.[column];
};

const mapPromptRow = (row, columns = defaultVaultSchema.prompts.columns) => {
  const rawNotes = getColumnName(row, columns.notes);
  const rawDescription = getColumnName(row, columns.description);
  const fallback =
    decodePromptFallback(typeof rawNotes === "string" ? rawNotes : null) ||
    decodePromptFallback(typeof rawDescription === "string" ? rawDescription : null);
  const resolvedDescription = (() => {
    const value = typeof rawDescription === "string" ? rawDescription : "";
    if (fallback && typeof value === "string" && value.trim().startsWith("{")) {
      return fallback.description ?? "";
    }
    if (value) {
      return value;
    }
    return fallback?.description ?? "";
  })();
  const resolvedNotes = (() => {
    const value = typeof rawNotes === "string" ? rawNotes : rawNotes ?? "";
    if (fallback && typeof value === "string" && value.trim().startsWith("{")) {
      return fallback.notes ?? "";
    }
    if (fallback?.notes && !value) {
      return fallback.notes;
    }
    return value;
  })();
  const resolvedReference = fallback?.reference ?? null;
  const rawReferenceContent =
    getColumnName(row, columns.reference_content) ?? resolvedReference?.content ?? null;
  const { key: referenceKey, legacyContent: referenceLegacyContent } =
    parseStorageValue(rawReferenceContent);
  const deletedAt = getColumnName(row, columns.deleted_at) ?? fallback?.deleted_at ?? null;
  return {
    id: getColumnName(row, columns.id),
    name: getColumnName(row, columns.name),
    description: resolvedDescription,
    notes: resolvedNotes,
    uploader: getColumnName(row, columns.uploader) ?? "Unknown",
    uploaderEmail: getColumnName(row, columns.uploader_email) ?? "",
    createdAt: getColumnName(row, columns.created_at) ?? new Date().toISOString(),
    deletedAt,
    referenceName: getColumnName(row, columns.reference_name) ?? resolvedReference?.name ?? "",
    referenceMime: getColumnName(row, columns.reference_mime) ?? resolvedReference?.mime ?? "",
    referenceSize: Number(
      getColumnName(row, columns.reference_size) ?? resolvedReference?.size ?? 0
    ),
    referenceContent: rawReferenceContent,
    referenceKey,
    referenceLegacyContent,
    fallbackData: fallback,
  };
};

const mapLinkRow = (row, columns = defaultVaultSchema.links.columns) => {
  const rawNotes = getColumnName(row, columns.notes);
  const fallback = decodeLinkFallback(typeof rawNotes === "string" ? rawNotes : null);
  const resolvedNotes = (() => {
    const value = typeof rawNotes === "string" ? rawNotes : rawNotes ?? "";
    if (fallback && typeof value === "string" && value.trim().startsWith("{")) {
      return fallback.notes ?? "";
    }
    if (fallback?.notes && !value) {
      return fallback.notes;
    }
    return value;
  })();
  const resolvedReference = fallback?.reference ?? null;
  const rawReferenceContent =
    getColumnName(row, columns.reference_content) ?? resolvedReference?.content ?? null;
  const { key: referenceKey, legacyContent: referenceLegacyContent } =
    parseStorageValue(rawReferenceContent);
  const deletedAt = getColumnName(row, columns.deleted_at) ?? fallback?.deleted_at ?? null;
  return {
    id: getColumnName(row, columns.id),
    name: getColumnName(row, columns.name),
    url: getColumnName(row, columns.url),
    notes: resolvedNotes,
    uploader: getColumnName(row, columns.uploader) ?? "Unknown",
    uploaderEmail: getColumnName(row, columns.uploader_email) ?? "",
    createdAt: getColumnName(row, columns.created_at) ?? new Date().toISOString(),
    deletedAt,
    referenceName: getColumnName(row, columns.reference_name) ?? resolvedReference?.name ?? "",
    referenceMime: getColumnName(row, columns.reference_mime) ?? resolvedReference?.mime ?? "",
    referenceSize: Number(
      getColumnName(row, columns.reference_size) ?? resolvedReference?.size ?? 0
    ),
    referenceContent: rawReferenceContent,
    referenceKey,
    referenceLegacyContent,
    fallbackData: fallback,
  };
};

const mapScriptRow = (row, columns = defaultVaultSchema.scripts.columns) => {
  const rawNotes = getColumnName(row, columns.notes);
  const fallback = decodeScriptFallback(typeof rawNotes === "string" ? rawNotes : null);
  const resolvedNotes = (() => {
    const value = typeof rawNotes === "string" ? rawNotes : rawNotes ?? "";
    if (fallback && typeof value === "string" && value.trim().startsWith("{")) {
      return fallback.notes ?? "";
    }
    if (fallback?.notes && !value) {
      return fallback.notes;
    }
    return value;
  })();
  const resolvedReference = fallback?.reference ?? null;
  const rawReferenceContent =
    getColumnName(row, columns.reference_content) ?? resolvedReference?.content ?? null;
  const { key: referenceKey, legacyContent: referenceLegacyContent } =
    parseStorageValue(rawReferenceContent);
  const rawContent = getColumnName(row, columns.file_content) ?? null;
  const { key: contentKey, legacyContent } = parseStorageValue(rawContent);
  const deletedAt = getColumnName(row, columns.deleted_at) ?? fallback?.deleted_at ?? null;
  return {
    id: getColumnName(row, columns.id),
    type: getColumnName(row, columns.type),
    name: getColumnName(row, columns.name),
    notes: resolvedNotes,
    uploader: getColumnName(row, columns.uploader) ?? "Unknown",
    uploaderEmail: getColumnName(row, columns.uploader_email) ?? "",
    createdAt: getColumnName(row, columns.created_at) ?? new Date().toISOString(),
    parentId: getColumnName(row, columns.parent_id) ?? null,
    mimeType:
      getColumnName(row, columns.file_mime) ??
      (getColumnName(row, columns.type) === "folder" ? "" : "application/octet-stream"),
    size: Number(getColumnName(row, columns.file_size) ?? 0),
    originalName: getColumnName(row, columns.original_name) ?? getColumnName(row, columns.name),
    content: rawContent,
    contentKey,
    legacyContent,
    deletedAt,
    referenceName: getColumnName(row, columns.reference_name) ?? resolvedReference?.name ?? "",
    referenceMime: getColumnName(row, columns.reference_mime) ?? resolvedReference?.mime ?? "",
    referenceSize: Number(
      getColumnName(row, columns.reference_size) ?? resolvedReference?.size ?? 0
    ),
    referenceContent: rawReferenceContent,
    referenceKey,
    referenceLegacyContent,
    fallbackData: fallback,
  };
};

function ensureAdmins(list) {
  const byEmail = new Map(list.map((user) => [user.email.toLowerCase(), user]));
  for (const admin of initialUsers) {
    const key = admin.email.toLowerCase();
    if (!byEmail.has(key)) {
      byEmail.set(key, admin);
    }
  }
  return Array.from(byEmail.values());
}

function formatVaultErrorMessage(error, fallback) {
  if (!error) {
    return fallback;
  }

  const message = typeof error.message === "string" ? error.message : "";
  if (error.details && typeof error.details === "string" && error.details.trim().length) {
    return `${message || fallback}\n${error.details}`;
  }
  if (message) {
    return message;
  }
  return fallback;
}

export default function App() {
  const isDraftMode = import.meta.env.MODE === "draft";
  const vaultReady = true;

  const [allowedEmails, setAllowedEmails] = useState(() => {
    if (typeof window === "undefined") {
      return initialAllowedEmails;
    }
    try {
      const raw = window.localStorage.getItem(ALLOWED_EMAILS_KEY);
      if (!raw) {
        return initialAllowedEmails;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return initialAllowedEmails;
      }
      const cleaned = parsed.map((email) => String(email).toLowerCase());
      return Array.from(new Set([...cleaned, ...initialAllowedEmails]));
    } catch (error) {
      console.warn("Failed to read allowed emails", error);
      return initialAllowedEmails;
    }
  });

  const [users, setUsers] = useState(() => {
    if (typeof window === "undefined") {
      return initialUsers;
    }
    try {
      const raw = window.localStorage.getItem(USERS_KEY);
      if (!raw) {
        return initialUsers;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return initialUsers;
      }
      const cleaned = parsed.map((user) => ({
        ...user,
        email: String(user.email).toLowerCase(),
      }));
      return ensureAdmins(cleaned);
    } catch (error) {
      console.warn("Failed to read stored users", error);
      return initialUsers;
    }
  });

  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState("login");
  const [authError, setAuthError] = useState("");
  const [activeView, setActiveView] = useState("dashboard");

  const [prompts, setPrompts] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [links, setLinks] = useState([]);
  const [trashedPrompts, setTrashedPrompts] = useState([]);
  const [trashedScripts, setTrashedScripts] = useState([]);
  const [trashedLinks, setTrashedLinks] = useState([]);

  const vaultSchema = useMemo(() => cloneSchema(defaultVaultSchema), []);

  const [vaultError, setVaultError] = useState("");
  const [vaultStatus, setVaultStatus] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);


  const [currentScriptFolderId, setCurrentScriptFolderId] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [uploaderFilters, setUploaderFilters] = useState({
    prompts: null,
    scripts: null,
    links: null,
  });
  const [uploadProgress, setUploadProgress] = useState({
    prompts: null,
    scripts: null,
    links: null,
  });
  const [preview, setPreview] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [linkDownloadTarget, setLinkDownloadTarget] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [searchValue, setSearchValue] = useState("");
  const [searchScope, setSearchScope] = useState({ type: "global", target: null });
  const [searchConfig, setSearchConfig] = useState({
    mode: "none",
    query: "",
    display: "",
    tab: null,
    user: null,
  });
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState("");
  const searchHandledRef = useRef("");

  const userScopeEmail = searchConfig.mode === "user" ? searchConfig.user : null;
  const searchQuery = searchConfig.query;
  const isSearchActive = useMemo(() => {
    if (searchConfig.mode === "user") {
      return Boolean(searchConfig.user);
    }
    if (searchConfig.mode === "global" || searchConfig.mode === "tab") {
      return Boolean(searchConfig.query);
    }
    return false;
  }, [searchConfig]);

  const isSearchActiveForCategory = useCallback(
    (category) => {
      if (!isSearchActive) {
        return false;
      }
      if (searchConfig.mode === "global") {
        return Boolean(searchConfig.query);
      }
      if (searchConfig.mode === "tab") {
        return searchConfig.tab === category && Boolean(searchConfig.query);
      }
      if (searchConfig.mode === "user") {
        return Boolean(searchConfig.user);
      }
      return false;
    },
    [isSearchActive, searchConfig]
  );

  const searchScopeLabel = useMemo(() => {
    if (searchScope.type === "user") {
      return searchScope.target ? `User: ${searchScope.target}` : "User search";
    }
    if (searchScope.type === "tab") {
      const label = TAB_LABELS[searchScope.target] || "Tab";
      return `${label} tab`;
    }
    return "Global";
  }, [searchScope]);

  const searchSummary = useMemo(() => {
    if (!isSearchActive) {
      return null;
    }
    if (searchConfig.mode === "user" && searchConfig.user) {
      if (searchConfig.display) {
        return `Searching "${searchConfig.display}" in uploads by ${searchConfig.user}`;
      }
      return `Viewing uploads by ${searchConfig.user}`;
    }
    if (searchConfig.mode === "tab" && searchConfig.tab) {
      const label = TAB_LABELS[searchConfig.tab] || searchConfig.tab;
      return searchConfig.display
        ? `Searching ${label} for "${searchConfig.display}"`
        : `Focused on the ${label} tab`;
    }
    if (searchConfig.mode === "global" && searchConfig.display) {
      return `Searching all tabs for "${searchConfig.display}"`;
    }
    return null;
  }, [isSearchActive, searchConfig]);

  const clearSearch = useCallback(() => {
    setSearchValue("");
    setSearchConfig({ mode: "none", query: "", display: "", tab: null, user: null });
    setSearchScope({ type: "global", target: null });
    setAdvancedSearchOpen(false);
    setSearchFeedback("");
    searchHandledRef.current = "";
  }, []);

  const [activeTab, setActiveTab] = useState("scripts");

  useEffect(() => {
    setSelectedItems((prev) => prev.filter((entry) => entry.category === activeTab));
    setContextMenu(null);
  }, [activeTab]);

  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
    setSelectedItems([]);
    setContextMenu(null);
  }, []);

  const [scriptMode, setScriptMode] = useState("file");
  const [scriptFiles, setScriptFiles] = useState([]);
  const [scriptFolderFiles, setScriptFolderFiles] = useState([]);

  const sessionHydratedRef = useRef(false);
  const folderInputRef = useRef(null);
  const contextMenuRef = useRef(null);
  const advancedSearchRef = useRef(null);

  const storageReady = vaultReady;
  const describeVaultError = useCallback(
    (error, fallback) => formatVaultErrorMessage(error, fallback),
    []
  );

  const beginUploadProgress = useCallback((category, label) => {
    const id = crypto.randomUUID();
    setUploadProgress((prev) => ({
      ...prev,
      [category]: { id, label, value: 0, status: "running" },
    }));
    return id;
  }, []);

  const updateUploadProgress = useCallback((category, id, updates) => {
    setUploadProgress((prev) => {
      const current = prev[category];
      if (!current || current.id !== id) {
        return prev;
      }
      const next = { ...current };
      if (typeof updates.label === "string") {
        next.label = updates.label;
      }
      if (typeof updates.status === "string") {
        next.status = updates.status;
      }
      if (typeof updates.value === "number") {
        const currentValue = typeof current.value === "number" ? current.value : 0;
        const clamped = Math.min(100, Math.max(0, updates.value));
        next.value = Math.max(currentValue, clamped);
      }
      return {
        ...prev,
        [category]: next,
      };
    });
  }, []);

  const completeUploadProgress = useCallback((category, id, label) => {
    setUploadProgress((prev) => {
      const current = prev[category];
      if (!current || current.id !== id) {
        return prev;
      }
      return {
        ...prev,
        [category]: {
          ...current,
          label: label ?? current.label,
          value: 100,
          status: "complete",
        },
      };
    });
    setTimeout(() => {
      setUploadProgress((prev) => {
        const current = prev[category];
        if (!current || current.id !== id || current.status !== "complete") {
          return prev;
        }
        return { ...prev, [category]: null };
      });
    }, 1200);
  }, []);

  const failUploadProgress = useCallback((category, id, label) => {
    setUploadProgress((prev) => {
      const current = prev[category];
      if (!current || current.id !== id) {
        return prev;
      }
      return {
        ...prev,
        [category]: {
          ...current,
          label: label ?? current.label,
          status: "error",
        },
      };
    });
    setTimeout(() => {
      setUploadProgress((prev) => {
        const current = prev[category];
        if (!current || current.id !== id || current.status !== "error") {
          return prev;
        }
        return { ...prev, [category]: null };
      });
    }, 3000);
  }, []);

  const ensureEmailAllowed = useCallback(
    async (email) => {
      if (!email) {
        return false;
      }
      if (allowedEmails.includes(email)) {
        return true;
      }
      if (!vaultReady || !vaultSchema.allowed_emails?.columns?.email) {
        return false;
      }
      try {
        const column = vaultSchema.allowed_emails.columns.email;
        const table = vaultSchema.allowed_emails.table;
        const response = await vaultRequest(
          `${table}?${encodeURIComponent(column)}=eq.${encodeURIComponent(email)}`
        );
        if (Array.isArray(response) && response.length) {
          setAllowedEmails((prev) => {
            const next = Array.from(new Set([...prev, email])).sort((a, b) => a.localeCompare(b));
            return next;
          });
          return true;
        }
      } catch (error) {
        console.warn("Failed to verify Cloudflare allowlist", error);
      }
      return false;
    },
    [allowedEmails, vaultReady, vaultSchema]
  );
  const connectionLabel = useMemo(() => {
    if (!vaultReady) return "Storage not configured";
    if (vaultError) return "Storage issue";
    if (workspaceLoading) return "Syncing Cloudflare R2…";
    return "Connected to Cloudflare R2";
  }, [vaultReady, vaultError, workspaceLoading]);
  const connectionClasses = useMemo(() => {
    if (!vaultReady) {
      return "border-white/10 bg-[#161b22] text-slate-300";
    }
    if (vaultError) {
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    }
    return "border-[#58a6ff]/40 bg-[#0b2f53] text-[#9cc4ff]";
  }, [vaultReady, vaultError]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (sessionHydratedRef.current) {
      return;
    }
    const storedEmail = window.localStorage.getItem(CURRENT_USER_KEY);
    sessionHydratedRef.current = true;
    if (!storedEmail) {
      return;
    }
    const normalized = storedEmail.toLowerCase();
    const existing = users.find((user) => user.email.toLowerCase() === normalized);
    if (existing) {
      setCurrentUser(existing);
    }
  }, [users]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (currentUser) {
      window.localStorage.setItem(CURRENT_USER_KEY, currentUser.email.toLowerCase());
    } else {
      window.localStorage.removeItem(CURRENT_USER_KEY);
    }
  }, [currentUser]);

  useEffect(() => {
    const node = folderInputRef.current;
    if (!node) return;
    if (scriptMode === "folder") {
      try {
        node.webkitdirectory = true;
      } catch (error) {
        // Some browsers expose the attribute but not the property; ignore failures.
      }
      node.setAttribute("webkitdirectory", "");
      node.setAttribute("directory", "");
      node.setAttribute("mozdirectory", "");
    } else {
      node.removeAttribute("webkitdirectory");
      node.removeAttribute("directory");
      node.removeAttribute("mozdirectory");
    }
  }, [scriptMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(ALLOWED_EMAILS_KEY, JSON.stringify(allowedEmails));
  }, [allowedEmails]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }, [users]);

  const executeVault = useCallback(
    async (tableKey, action) => action(vaultSchema),
    [vaultSchema]
  );

  const collectScriptBranchIds = useCallback(
    (rootId, sourceItems = scripts) => {
      const ids = new Set([rootId]);
      const queue = [rootId];
      while (queue.length) {
        const current = queue.shift();
        sourceItems.forEach((item) => {
          if (item.parentId === current && !ids.has(item.id)) {
            ids.add(item.id);
            queue.push(item.id);
          }
        });
      }
      return ids;
    },
    [scripts]
  );

  const cleanupExpiredTrash = useCallback(
    async ({ prompts: expiredPrompts = [], links: expiredLinks = [], scripts: expiredScripts = [] }) => {
      if (!storageReady) return;

      const deleteByIds = async (tableKey, ids) => {
        if (!ids.length) return;
        await executeVault(tableKey, async (schema) => {
          const config = schema[tableKey];
          const column = config.columns.id ?? "id";
          const table = config.table;
          const chunkSize = 50;
          for (let i = 0; i < ids.length; i += chunkSize) {
            const chunk = ids.slice(i, i + chunkSize);
            const idList = chunk
              .filter(Boolean)
              .map((value) => `"${value}"`)
              .join(",");
            if (!idList) continue;
            const encodedValues = encodeURIComponent(`(${idList})`);
            await vaultRequest(
              `${table}?${encodeURIComponent(column)}=in.${encodedValues}`,
              { method: "DELETE" }
            );
          }
        });
      };

      try {
        await deleteByIds(
          "prompts",
          expiredPrompts.map((item) => item.id).filter(Boolean)
        );
        await deleteByIds(
          "links",
          expiredLinks.map((item) => item.id).filter(Boolean)
        );
        await deleteByIds(
          "scripts",
          expiredScripts.map((item) => item.id).filter(Boolean)
        );
      } catch (error) {
        console.warn("Failed to clean up expired trash", error);
      }
    },
    [executeVault, storageReady]
  );

  const partitionTrashEntries = useCallback((items) => {
    const active = [];
    const trashed = [];
    const expired = [];
    const cutoff = Date.now() - TRASH_RETENTION_MS;

    items.forEach((item) => {
      const deletedAt = item.deletedAt ? new Date(item.deletedAt).getTime() : null;
      if (!deletedAt || Number.isNaN(deletedAt)) {
        active.push({ ...item, deletedAt: null });
        return;
      }
      if (deletedAt < cutoff) {
        expired.push(item);
      } else {
        trashed.push(item);
      }
    });

    return { active, trashed, expired };
  }, []);

  const refreshWorkspace = useCallback(async () => {
    if (!vaultReady) {
      return;
    }
    try {
      setWorkspaceLoading(true);
      setVaultStatus("Syncing workspace from Cloudflare R2…");
      setVaultError("");

      const [allowedEmailRows, promptsData, linksData, scriptsData] = await Promise.all([
        vaultSchema.allowed_emails.columns.email
          ? vaultRequest(`${vaultSchema.allowed_emails.table}?select=*`)
          : Promise.resolve(null),
        vaultRequest(`${vaultSchema.prompts.table}?select=*`),
        vaultRequest(`${vaultSchema.links.table}?select=*`),
        vaultRequest(`${vaultSchema.scripts.table}?select=*`),
      ]);

      if (Array.isArray(allowedEmailRows)) {
        const emailColumn = vaultSchema.allowed_emails.columns.email;
        const fetched = allowedEmailRows
          .map((row) => String(getColumnName(row, emailColumn) || "").trim().toLowerCase())
          .filter(Boolean);
        const missingDefaults = initialAllowedEmails.filter(
          (email) => !fetched.includes(email)
        );
        if (missingDefaults.length) {
          try {
            await executeVault("allowed_emails", async (schema) => {
              const seedRows = missingDefaults.map((email) =>
                shapeVaultPayload(schema.allowed_emails, {
                  email,
                  role: protectedAdminEmails.has(email) ? "admin" : "member",
                  created_at: new Date().toISOString(),
                })
              );
              if (!seedRows.length) return;
              await vaultRequest(schema.allowed_emails.table, {
                method: "POST",
                headers: { Prefer: "resolution=ignore-duplicates" },
                body: JSON.stringify(seedRows),
              });
            });
            fetched.push(...missingDefaults);
          } catch (error) {
            console.warn("Failed to seed default allowed emails", error);
            setVaultError(
              describeVaultError(
                error,
                "Unable to seed the default admin allowlist in Cloudflare R2."
              )
            );
          }
        }
        const unique = Array.from(new Set([...initialAllowedEmails, ...fetched])).sort((a, b) =>
          a.localeCompare(b)
        );
        setAllowedEmails(unique);
      }

      const promptEntries = (promptsData ?? []).map((row) =>
        mapPromptRow(row, vaultSchema.prompts.columns)
      );
      const linkEntries = (linksData ?? []).map((row) =>
        mapLinkRow(row, vaultSchema.links.columns)
      );
      const scriptEntries = (scriptsData ?? []).map((row) =>
        mapScriptRow(row, vaultSchema.scripts.columns)
      );

      const promptPartitions = partitionTrashEntries(promptEntries);
      const linkPartitions = partitionTrashEntries(linkEntries);
      const scriptPartitions = partitionTrashEntries(scriptEntries);

      promptPartitions.active.sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
      promptPartitions.trashed.sort(
        (a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0)
      );
      linkPartitions.active.sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
      linkPartitions.trashed.sort(
        (a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0)
      );

      setPrompts(promptPartitions.active);
      setTrashedPrompts(promptPartitions.trashed.map((item) => ({ ...item, category: "prompts" })));
      setLinks(linkPartitions.active);
      setTrashedLinks(linkPartitions.trashed.map((item) => ({ ...item, category: "links" })));
      setScripts(scriptPartitions.active);
      setTrashedScripts(scriptPartitions.trashed.map((item) => ({ ...item, category: "scripts" })));

      if (
        promptPartitions.expired.length ||
        linkPartitions.expired.length ||
        scriptPartitions.expired.length
      ) {
        await cleanupExpiredTrash({
          prompts: promptPartitions.expired,
          links: linkPartitions.expired,
          scripts: scriptPartitions.expired,
        });
      }
    } catch (error) {
      console.error("Failed to sync Cloudflare R2", error);
      setVaultError(
        describeVaultError(error, "Unable to sync the Cloudflare vault workspace.")
      );
    } finally {
      setWorkspaceLoading(false);
      setVaultStatus("");
    }
  }, [vaultReady, vaultSchema, executeVault, partitionTrashEntries, cleanupExpiredTrash, describeVaultError]);

  useEffect(() => {
    if (!vaultReady) {
      return;
    }
    refreshWorkspace();
  }, [vaultReady, refreshWorkspace]);

  useEffect(() => {
    if (searchScope.type === "tab" && !searchScope.target) {
      setSearchScope((prev) => {
        if (prev.type !== "tab" || prev.target) {
          return prev;
        }
        return { ...prev, target: "scripts" };
      });
    }
  }, [searchScope.type, searchScope.target]);

  const activeUserEmails = useMemo(() => {
    const emails = users.map((user) => normalizeSearchValue(user.email));
    return Array.from(new Set(emails.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [users]);

  useEffect(() => {
    if (searchScope.type === "user" && !searchScope.target && activeUserEmails.length) {
      setSearchScope((prev) => {
        if (prev.type !== "user" || prev.target) {
          return prev;
        }
        return { ...prev, target: activeUserEmails[0] };
      });
    }
  }, [searchScope.type, searchScope.target, activeUserEmails]);

  useEffect(() => {
    if (!advancedSearchOpen) {
      return undefined;
    }
    const handleClick = (event) => {
      if (advancedSearchRef.current && !advancedSearchRef.current.contains(event.target)) {
        setAdvancedSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [advancedSearchOpen]);

  useEffect(() => {
    const handleClick = (event) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      window.addEventListener("click", handleClick);
    }
    return () => {
      window.removeEventListener("click", handleClick);
    };
  }, [contextMenu]);

  const scriptsById = useMemo(() => {
    const map = new Map();
    scripts.forEach((item) => map.set(item.id, item));
    return map;
  }, [scripts]);

  const scriptPathLabels = useMemo(() => {
    const map = new Map();
    scripts.forEach((item) => {
      const parts = [item.name];
      let parentId = item.parentId;
      while (parentId) {
        const parent = scriptsById.get(parentId);
        if (!parent) {
          break;
        }
        parts.push(parent.name);
        parentId = parent.parentId;
      }
      const label = parts.filter(Boolean).reverse().join(" / ");
      map.set(item.id, label || item.name || "");
    });
    return map;
  }, [scripts, scriptsById]);

  const trashedScriptsById = useMemo(() => {
    const map = new Map();
    trashedScripts.forEach((item) => map.set(item.id, item));
    return map;
  }, [trashedScripts]);

  const trashedScriptPathLabels = useMemo(() => {
    const map = new Map();
    trashedScripts.forEach((item) => {
      const parts = [item.name];
      let parentId = item.parentId;
      while (parentId) {
        const parent = trashedScriptsById.get(parentId);
        if (!parent) {
          break;
        }
        parts.push(parent.name);
        parentId = parent.parentId;
      }
      const label = parts.filter(Boolean).reverse().join(" / ");
      map.set(item.id, label || item.name || "");
    });
    return map;
  }, [trashedScripts, trashedScriptsById]);

  const visibleTrashedPrompts = useMemo(() => {
    let result = trashedPrompts;
    if (userScopeEmail) {
      result = result.filter((entry) => normalizeSearchValue(entry.uploaderEmail) === userScopeEmail);
    }
    if (isSearchActiveForCategory("bin") && searchQuery) {
      result = result.filter((entry) => promptMatchesSearch(entry, searchQuery));
    }
    return result;
  }, [trashedPrompts, userScopeEmail, isSearchActiveForCategory, searchQuery]);

  const visibleTrashedLinks = useMemo(() => {
    let result = trashedLinks;
    if (userScopeEmail) {
      result = result.filter((entry) => normalizeSearchValue(entry.uploaderEmail) === userScopeEmail);
    }
    if (isSearchActiveForCategory("bin") && searchQuery) {
      result = result.filter((entry) => linkMatchesSearch(entry, searchQuery));
    }
    return result;
  }, [trashedLinks, userScopeEmail, isSearchActiveForCategory, searchQuery]);

  const visibleTrashedScripts = useMemo(() => {
    let result = trashedScripts;
    if (userScopeEmail) {
      result = result.filter((entry) => normalizeSearchValue(entry.uploaderEmail) === userScopeEmail);
    }
    if (isSearchActiveForCategory("bin") && searchQuery) {
      const matching = new Set();
      result.forEach((entry) => {
        if (scriptMatchesSearch(entry, searchQuery, trashedScriptPathLabels.get(entry.id) || "")) {
          matching.add(entry.id);
          let parentId = entry.parentId;
          while (parentId) {
            matching.add(parentId);
            const parent = trashedScriptsById.get(parentId);
            if (!parent) {
              break;
            }
            parentId = parent.parentId;
          }
        }
      });
      if (matching.size) {
        result = result.filter((entry) => matching.has(entry.id));
      }
    }
    return result;
  }, [
    trashedScripts,
    userScopeEmail,
    isSearchActiveForCategory,
    searchQuery,
    trashedScriptPathLabels,
    trashedScriptsById,
  ]);

  const trashedScriptRoots = useMemo(() => {
    const trashedIds = new Set(visibleTrashedScripts.map((item) => item.id));
    return visibleTrashedScripts.filter(
      (item) => !item.parentId || !trashedIds.has(item.parentId)
    );
  }, [visibleTrashedScripts]);

  const trashedScriptSummaries = useMemo(() => {
    const summaries = trashedScriptRoots.map((root) => {
      const ids = collectScriptBranchIds(root.id, visibleTrashedScripts);
      let fileCount = 0;
      let folderCount = 0;
      ids.forEach((id) => {
        if (id === root.id) return;
        const node = trashedScriptsById.get(id);
        if (!node) return;
        if (node.type === "folder") {
          folderCount += 1;
        } else {
          fileCount += 1;
        }
      });
      const pathLabel = trashedScriptPathLabels.get(root.id) || "";
      const decoratedRoot = pathLabel ? { ...root, pathLabel } : root;
      return { root: decoratedRoot, ids, fileCount, folderCount };
    });
    return summaries.sort(
      (a, b) => new Date(b.root.deletedAt || 0) - new Date(a.root.deletedAt || 0)
    );
  }, [
    trashedScriptRoots,
    visibleTrashedScripts,
    trashedScriptsById,
    collectScriptBranchIds,
  ]);

  const scriptBreadcrumbs = useMemo(() => {
    const chain = [];
    let current = currentScriptFolderId ? scriptsById.get(currentScriptFolderId) : null;
    while (current) {
      chain.push({ id: current.id, label: current.name, active: chain.length === 0 });
    current = current.parentId ? scriptsById.get(current.parentId) : null;
    }
    chain.push({ id: null, label: "Scripts", active: chain.length === 0 });
    return chain.reverse().map((crumb, index, array) => ({ ...crumb, active: index === array.length - 1 }));
  }, [currentScriptFolderId, scriptsById]);

  const promptUploaders = useMemo(() => {
    const unique = new Set();
    prompts.forEach((entry) => {
      const email = String(entry.uploaderEmail || "").toLowerCase();
      if (email) {
        unique.add(email);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [prompts]);

  const linkUploaders = useMemo(() => {
    const unique = new Set();
    links.forEach((entry) => {
      const email = String(entry.uploaderEmail || "").toLowerCase();
      if (email) {
        unique.add(email);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [links]);

  const scriptUploaders = useMemo(() => {
    const unique = new Set();
    scripts.forEach((entry) => {
      const email = String(entry.uploaderEmail || "").toLowerCase();
      if (email) {
        unique.add(email);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [scripts]);

  const filteredPrompts = useMemo(() => {
    let result = prompts;
    const filter = uploaderFilters.prompts;
    if (filter) {
      result = result.filter((entry) => normalizeSearchValue(entry.uploaderEmail) === filter);
    }
    if (userScopeEmail) {
      result = result.filter((entry) => normalizeSearchValue(entry.uploaderEmail) === userScopeEmail);
    }
    if (isSearchActiveForCategory("prompts") && searchQuery) {
      result = result.filter((entry) => promptMatchesSearch(entry, searchQuery));
    }
    return result;
  }, [
    prompts,
    uploaderFilters.prompts,
    userScopeEmail,
    isSearchActiveForCategory,
    searchQuery,
  ]);

  const filteredLinks = useMemo(() => {
    let result = links;
    const filter = uploaderFilters.links;
    if (filter) {
      result = result.filter((entry) => normalizeSearchValue(entry.uploaderEmail) === filter);
    }
    if (userScopeEmail) {
      result = result.filter((entry) => normalizeSearchValue(entry.uploaderEmail) === userScopeEmail);
    }
    if (isSearchActiveForCategory("links") && searchQuery) {
      result = result.filter((entry) => linkMatchesSearch(entry, searchQuery));
    }
    return result;
  }, [links, uploaderFilters.links, userScopeEmail, isSearchActiveForCategory, searchQuery]);

  const scriptSearchShouldFlatten = useMemo(() => {
    if (userScopeEmail) {
      return true;
    }
    if (searchConfig.mode === "global") {
      return Boolean(searchQuery);
    }
    if (searchConfig.mode === "tab") {
      return searchConfig.tab === "scripts" && Boolean(searchQuery);
    }
    return false;
  }, [userScopeEmail, searchConfig, searchQuery]);

  const scriptsInView = useMemo(() => {
    const applyUploaderFilter = (items) => {
      const filter = uploaderFilters.scripts;
      if (!filter) {
        return items;
      }
      return items.filter((entry) => normalizeSearchValue(entry.uploaderEmail) === filter);
    };

    const applyUserScope = (items) => {
      if (!userScopeEmail) {
        return items;
      }
      return items.filter((entry) => normalizeSearchValue(entry.uploaderEmail) === userScopeEmail);
    };

    const includePathLabel = scriptSearchShouldFlatten || (isSearchActiveForCategory("scripts") && Boolean(searchQuery));

    if (scriptSearchShouldFlatten) {
      let result = applyUserScope(applyUploaderFilter(scripts));
      if (isSearchActiveForCategory("scripts") && searchQuery) {
        result = result.filter((entry) =>
          scriptMatchesSearch(entry, searchQuery, scriptPathLabels.get(entry.id) || "")
        );
      }
      return result
        .map((entry) => ({
          ...entry,
          pathLabel: includePathLabel ? scriptPathLabels.get(entry.id) || "" : undefined,
        }))
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    let base = scripts.filter((item) => item.parentId === (currentScriptFolderId ?? null));
    base = applyUserScope(applyUploaderFilter(base));
    if (isSearchActiveForCategory("scripts") && searchQuery) {
      base = base.filter((entry) =>
        scriptMatchesSearch(entry, searchQuery, scriptPathLabels.get(entry.id) || "")
      );
    }
    return base.map((entry) => ({
      ...entry,
      pathLabel: includePathLabel ? scriptPathLabels.get(entry.id) || "" : undefined,
    }));
  }, [
    scripts,
    currentScriptFolderId,
    uploaderFilters.scripts,
    userScopeEmail,
    scriptSearchShouldFlatten,
    isSearchActiveForCategory,
    searchQuery,
    scriptPathLabels,
  ]);

  useEffect(() => {
    if (!isSearchActive) {
      if (searchFeedback) {
        setSearchFeedback("");
      }
      searchHandledRef.current = "";
      return;
    }

    const queryDisplay = searchConfig.display || searchConfig.query || "";
    const signature = [
      searchConfig.mode,
      searchConfig.tab || "",
      searchConfig.user || "",
      queryDisplay,
      scriptsInView.length,
      filteredPrompts.length,
      filteredLinks.length,
      trashedScriptSummaries.length,
      visibleTrashedPrompts.length,
      visibleTrashedLinks.length,
    ].join("|");

    if (searchHandledRef.current.startsWith(signature)) {
      return;
    }

    const counts = {
      scripts: scriptsInView.length,
      prompts: filteredPrompts.length,
      links: filteredLinks.length,
      bin:
        trashedScriptSummaries.length +
        visibleTrashedPrompts.length +
        visibleTrashedLinks.length,
    };

    const firstItemFor = (category) => {
      if (category === "scripts") return scriptsInView[0] || null;
      if (category === "prompts") return filteredPrompts[0] || null;
      if (category === "links") return filteredLinks[0] || null;
      return null;
    };

    const noResultsMessage = () => {
      if (searchConfig.mode === "user" && searchConfig.user) {
        return `No uploads found for ${searchConfig.user}.`;
      }
      if (queryDisplay) {
        return `No files found for “${queryDisplay}”.`;
      }
      return "No uploads match the selected filters.";
    };

    let targetCategory = null;
    if (searchConfig.mode === "tab") {
      targetCategory = searchConfig.tab || "scripts";
      if (!counts[targetCategory]) {
        const label = TAB_LABELS[targetCategory] || targetCategory;
        const message = queryDisplay
          ? `No files found for “${queryDisplay}” in ${label}.`
          : searchConfig.mode === "user" && searchConfig.user
          ? `No uploads found for ${searchConfig.user}.`
          : "No uploads match the selected filters.";
        if (searchFeedback !== message) {
          setSearchFeedback(message);
        }
        searchHandledRef.current = `${signature}:none`;
        return;
      }
    } else {
      const order = ["scripts", "prompts", "links", "bin"];
      targetCategory = order.find((category) => counts[category]) || null;
      if (!targetCategory) {
        const message = noResultsMessage();
        if (searchFeedback !== message) {
          setSearchFeedback(message);
        }
        searchHandledRef.current = `${signature}:none`;
        return;
      }
    }

    if (searchFeedback) {
      setSearchFeedback("");
    }

    if (targetCategory !== "bin" && counts[targetCategory]) {
      const firstItem = firstItemFor(targetCategory);
      if (
        firstItem &&
        (!preview || preview.category !== targetCategory || preview.item?.id !== firstItem.id)
      ) {
        setPreview({ category: targetCategory, item: firstItem });
      }
    }

    if (activeTab !== targetCategory) {
      setActiveTab(targetCategory);
    }

    searchHandledRef.current = `${signature}:${targetCategory}`;
  }, [
    isSearchActive,
    searchConfig,
    searchFeedback,
    scriptsInView,
    filteredPrompts,
    filteredLinks,
    trashedScriptSummaries,
    visibleTrashedPrompts,
    visibleTrashedLinks,
    preview,
    activeTab,
  ]);

  const totals = useMemo(
    () => ({
      prompts: prompts.length,
      links: links.length,
      scripts: scripts.filter((item) => item.type === "file").length,
      bin: trashedPrompts.length + trashedLinks.length + trashedScriptSummaries.length,
    }),
    [prompts, links, scripts, trashedPrompts, trashedLinks, trashedScriptSummaries]
  );

  const selectedCounts = useMemo(
    () => ({
      prompts: selectedItems.filter((entry) => entry.category === "prompts").length,
      scripts: selectedItems.filter((entry) => entry.category === "scripts").length,
      links: selectedItems.filter((entry) => entry.category === "links").length,
    }),
    [selectedItems]
  );

  const isBusy = isProcessing || workspaceLoading;
  const adminOnly = currentUser?.role === "admin";

  const handleAuth = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim().toLowerCase();
    const password = String(form.get("password"));
    const name = String(form.get("name") || "").trim();

    if (authView === "login") {
      const user = users.find((u) => u.email.toLowerCase() === email && u.password === password);
      if (!user) {
        setAuthError("Invalid email or password. Try again.");
        return;
      }
      setCurrentUser(user);
      setAuthError("");
      setActiveView("dashboard");
      return;
    }

    const hasAccess = await ensureEmailAllowed(email);
    if (!hasAccess) {
      setAuthError("This email does not have access yet. Ask an admin for approval.");
      return;
    }
    if (!name) {
      setAuthError("Please provide your name so teammates know who uploaded files.");
      return;
    }
    if (users.some((u) => u.email.toLowerCase() === email)) {
      setAuthError("An account already exists for this email. Please log in instead.");
      return;
    }
    const newUser = {
      id: crypto.randomUUID(),
      name,
      email,
      password,
      role: "member",
    };
    setUsers((prev) => [...prev, newUser]);
    setCurrentUser(newUser);
    setAuthError("");
    setActiveView("dashboard");
  };

  const handleSearchSubmit = useCallback(
    (event) => {
      event.preventDefault();
      const rawQuery = searchValue.trim();
      const normalizedQuery = rawQuery.toLowerCase();
      if (searchScope.type === "global") {
        if (!rawQuery) {
          setSearchConfig({ mode: "none", query: "", display: "", tab: null, user: null });
          return;
        }
        setSearchConfig({
          mode: "global",
          query: normalizedQuery,
          display: rawQuery,
          tab: null,
          user: null,
        });
        setAdvancedSearchOpen(false);
        return;
      }

      if (searchScope.type === "tab") {
        const targetTab = searchScope.target || "scripts";
        setActiveTab(targetTab);
        setSearchConfig({
          mode: "tab",
          query: normalizedQuery,
          display: rawQuery,
          tab: targetTab,
          user: null,
        });
        setAdvancedSearchOpen(false);
        return;
      }

      if (searchScope.type === "user") {
        const targetUser = searchScope.target || activeUserEmails[0] || null;
        if (!targetUser) {
          return;
        }
        setSearchConfig({
          mode: "user",
          query: normalizedQuery,
          display: rawQuery,
          tab: null,
          user: targetUser,
        });
        setAdvancedSearchOpen(false);
      }
    },
    [
      searchValue,
      searchScope,
      setActiveTab,
      activeUserEmails,
    ]
  );

  const handleAddPrompt = async (event) => {
    event.preventDefault();
    if (!currentUser || !storageReady) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    const referenceFile = form.get("reference");
    const hasReference =
      referenceFile && typeof referenceFile === "object" && "size" in referenceFile && referenceFile.size;
    if (!name) return;
    const createdAt = new Date().toISOString();
    const id = crypto.randomUUID();
    const referenceData = hasReference
      ? await prepareReferenceFile(referenceFile, { category: "prompts", ownerId: id })
      : null;
    let progressId = null;
    try {
      setIsProcessing(true);
      setVaultError("");
      progressId = beginUploadProgress("prompts", "Saving prompt…");
      updateUploadProgress("prompts", progressId, { value: 15 });
      const payload = {
        id,
        name,
        description,
        notes,
        uploader: currentUser.name,
        uploader_email: currentUser.email,
        created_at: createdAt,
        deleted_at: null,
        reference_name: referenceData?.name ?? null,
        reference_mime: referenceData?.mime ?? null,
        reference_size: referenceData?.size ?? null,
        reference_content: referenceData?.content ?? null,
      };
      const entry = await executeVault("prompts", async (schema) => {
        const shapedPayload = applyPromptFallbackColumns(
          schema.prompts,
          shapeVaultPayload(schema.prompts, payload),
          payload
        );
        updateUploadProgress("prompts", progressId, {
          label: "Uploading to Cloudflare R2…",
          value: 45,
        });
        const data = await vaultRequest(schema.prompts.table, {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify([shapedPayload]),
        });
        return mapPromptRow((data ?? [shapedPayload])[0], schema.prompts.columns);
      });
      updateUploadProgress("prompts", progressId, { label: "Finalising prompt…", value: 80 });
      setPrompts((prev) =>
        [...prev, entry].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      );
      formElement?.reset();
      completeUploadProgress("prompts", progressId, "Prompt saved");
      setVaultError("");
      refreshWorkspace();
    } catch (error) {
      console.error("Failed to add prompt", error);
      if (progressId) {
        failUploadProgress("prompts", progressId, "Prompt upload failed");
      }
      setVaultError(
        describeVaultError(error, "Unable to save the prompt to Cloudflare R2.")
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddLink = async (event) => {
    event.preventDefault();
    if (!currentUser || !storageReady) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim();
    const url = String(form.get("url") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    const referenceFile = form.get("reference");
    const hasReference =
      referenceFile && typeof referenceFile === "object" && "size" in referenceFile && referenceFile.size;
    if (!name || !url) return;
    const createdAt = new Date().toISOString();
    const id = crypto.randomUUID();
    const referenceData = hasReference
      ? await prepareReferenceFile(referenceFile, { category: "links", ownerId: id })
      : null;
    let progressId = null;
    try {
      setIsProcessing(true);
      setVaultError("");
      progressId = beginUploadProgress("links", "Saving link…");
      updateUploadProgress("links", progressId, { value: 15 });
      const payload = {
        id,
        name,
        url,
        notes,
        uploader: currentUser.name,
        uploader_email: currentUser.email,
        created_at: createdAt,
        deleted_at: null,
        reference_name: referenceData?.name ?? null,
        reference_mime: referenceData?.mime ?? null,
        reference_size: referenceData?.size ?? null,
        reference_content: referenceData?.content ?? null,
      };
      const entry = await executeVault("links", async (schema) => {
        const shapedPayload = applyLinkFallbackColumns(
          schema.links,
          shapeVaultPayload(schema.links, payload),
          payload
        );
        updateUploadProgress("links", progressId, {
          label: "Uploading to Cloudflare R2…",
          value: 45,
        });
        const data = await vaultRequest(schema.links.table, {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify([shapedPayload]),
        });
        return mapLinkRow((data ?? [shapedPayload])[0], schema.links.columns);
      });
      updateUploadProgress("links", progressId, { label: "Finalising link…", value: 80 });
      setLinks((prev) =>
        [...prev, entry].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      );
      formElement?.reset();
      completeUploadProgress("links", progressId, "Link saved");
      setVaultError("");
      refreshWorkspace();
    } catch (error) {
      console.error("Failed to add link", error);
      if (progressId) {
        failUploadProgress("links", progressId, "Link upload failed");
      }
      setVaultError(
        describeVaultError(error, "Unable to save the link to Cloudflare R2.")
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const gatherFolderRows = async ({
    files,
    name,
    notes,
    createdAt,
    parentLogicalId,
    onProgress,
    reference,
    rootId = crypto.randomUUID(),
  }) => {
    const rows = [];
    const defaultRootName = files[0]?.webkitRelativePath?.split("/")[0] || "Folder";
    const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    let processedBytes = 0;
    const reportProgress = (fileName = "") => {
      if (typeof onProgress === "function") {
        onProgress({ processedBytes, totalBytes, fileName });
      }
    };
    const rootRow = {
      id: rootId,
      type: "folder",
      name: name || defaultRootName,
      original_name: name || defaultRootName,
      file_mime: "",
      file_size: 0,
      file_content: null,
      notes,
      uploader: currentUser.name,
      uploader_email: currentUser.email,
      created_at: createdAt,
      parent_id: parentLogicalId,
      deleted_at: null,
      reference_name: reference?.name ?? null,
      reference_mime: reference?.mime ?? null,
      reference_size: reference?.size ?? null,
      reference_content: reference?.content ?? null,
    };
    rows.push(rootRow);
    const pathToFolderId = new Map();
    pathToFolderId.set("", rootId);

    reportProgress();

    for (const file of files) {
      const rawPath = file.webkitRelativePath || file.name;
      const parts = rawPath.split("/");
      if (parts.length > 1) {
        parts.shift();
      }
      const fileName = parts.pop() || file.name;
      let currentPath = "";
      for (const segment of parts) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        if (!pathToFolderId.has(currentPath)) {
          const folderId = crypto.randomUUID();
          const parentPath = currentPath.split("/").slice(0, -1).join("/");
          const folderParentId = parentPath ? pathToFolderId.get(parentPath) : rootId;
      rows.push({
        id: folderId,
        type: "folder",
        name: segment,
        original_name: segment,
        file_mime: "",
        file_size: 0,
        file_content: null,
        notes,
        uploader: currentUser.name,
        uploader_email: currentUser.email,
        created_at: createdAt,
        parent_id: folderParentId,
        deleted_at: null,
        reference_name: null,
        reference_mime: null,
        reference_size: null,
        reference_content: null,
      });
          pathToFolderId.set(currentPath, folderId);
        }
      }
      const parentPathKey = parts.join("/");
      const folderId = parentPathKey ? pathToFolderId.get(parentPathKey) : rootId;
      const fileId = crypto.randomUUID();
      const storageKey = await uploadFileToR2({
        key: `scripts/${fileId}/${Date.now()}-${safeFileName(file.name)}`,
        file,
        contentType: file.type || "application/octet-stream",
      });
      rows.push({
        id: fileId,
        type: "file",
        name: fileName,
        original_name: file.name,
        file_mime: file.type || "application/octet-stream",
        file_size: Number(file.size || 0),
        file_content: encodeStoragePointer(storageKey),
        notes,
        uploader: currentUser.name,
        uploader_email: currentUser.email,
        created_at: createdAt,
        parent_id: folderId,
        deleted_at: null,
        reference_name: null,
        reference_mime: null,
        reference_size: null,
        reference_content: null,
      });
      processedBytes += Number(file.size || 0);
      reportProgress(file.name);
    }

    return rows;
  };

  const handleAddScript = async (event) => {
    event.preventDefault();
    if (!currentUser || !storageReady) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    const referenceFile = form.get("reference");
    const hasReference =
      referenceFile && typeof referenceFile === "object" && "size" in referenceFile && referenceFile.size;
    const createdAt = new Date().toISOString();
    const parentLogicalId = currentScriptFolderId ?? null;
    let progressId = null;

    try {
      setIsProcessing(true);
      setVaultError("");

      if (scriptMode === "file") {
        if (!scriptFiles.length) return;
        const file = scriptFiles[0];
        const scriptId = crypto.randomUUID();
        const referenceData = hasReference
          ? await prepareReferenceFile(referenceFile, {
              category: "scripts",
              ownerId: scriptId,
            })
          : null;
        progressId = beginUploadProgress("scripts", "Preparing script file…");
        updateUploadProgress("scripts", progressId, { value: 12 });
        updateUploadProgress("scripts", progressId, {
          label: "Requesting storage…",
          value: 28,
        });
        const storageKey = await uploadFileToR2({
          key: `scripts/${scriptId}/${Date.now()}-${safeFileName(file.name)}`,
          file,
          contentType: file.type || "application/octet-stream",
        });
        const payload = {
          id: scriptId,
          type: "file",
          name: name || file.name,
          original_name: file.name,
          file_mime: file.type || "application/octet-stream",
          file_size: Number(file.size || 0),
          notes,
          uploader: currentUser.name,
          uploader_email: currentUser.email,
          created_at: createdAt,
          parent_id: parentLogicalId,
          file_content: encodeStoragePointer(storageKey),
          deleted_at: null,
          reference_name: referenceData?.name ?? null,
          reference_mime: referenceData?.mime ?? null,
          reference_size: referenceData?.size ?? null,
          reference_content: referenceData?.content ?? null,
        };
        const entry = await executeVault("scripts", async (schema) => {
          const shapedPayload = applyScriptFallbackColumns(
            schema.scripts,
            shapeVaultPayload(schema.scripts, payload),
            payload
          );
          updateUploadProgress("scripts", progressId, {
            label: "Saving metadata…",
            value: 55,
          });
          const data = await vaultRequest(schema.scripts.table, {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify([shapedPayload]),
          });
          return mapScriptRow((data ?? [shapedPayload])[0], schema.scripts.columns);
        });
        updateUploadProgress("scripts", progressId, {
          label: "Finalising upload…",
          value: 85,
        });
        setScripts((prev) => [...prev, entry]);
        setScriptFiles([]);
        formElement?.reset();
        completeUploadProgress("scripts", progressId, "Upload complete");
        setVaultError("");
        refreshWorkspace();
        return;
      }

      if (!scriptFolderFiles.length) return;
      const rootId = crypto.randomUUID();
      const referenceData = hasReference
        ? await prepareReferenceFile(referenceFile, {
            category: "scripts",
            ownerId: rootId,
          })
        : null;
      progressId = beginUploadProgress("scripts", "Preparing folder upload…");
      updateUploadProgress("scripts", progressId, { value: 12 });
      const rows = await gatherFolderRows({
        files: Array.from(scriptFolderFiles),
        name,
        notes,
        createdAt,
        parentLogicalId,
        reference: referenceData,
        rootId,
        onProgress: ({ processedBytes, totalBytes, fileName }) => {
          if (!progressId) return;
          const portion = totalBytes ? processedBytes / totalBytes : 1;
          const value = 12 + portion * 50;
          updateUploadProgress("scripts", progressId, {
            value,
            label: fileName ? `Uploading ${fileName}` : "Preparing folder…",
          });
        },
      });
      const inserted = await executeVault("scripts", async (schema) => {
        const shapedRows = rows.map((row) =>
          applyScriptFallbackColumns(
            schema.scripts,
            shapeVaultPayload(schema.scripts, row),
            row
          )
        );
        updateUploadProgress("scripts", progressId, {
          label: "Uploading to Cloudflare R2…",
          value: 75,
        });
        const data = await vaultRequest(schema.scripts.table, {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(shapedRows),
        });
        const responseRows = Array.isArray(data) ? data : shapedRows;
        return responseRows.map((row) => mapScriptRow(row, schema.scripts.columns));
      });
      updateUploadProgress("scripts", progressId, {
        label: "Finalising upload…",
        value: 92,
      });
      setScripts((prev) => [...prev, ...inserted]);
      setScriptFolderFiles([]);
      formElement?.reset();
      completeUploadProgress("scripts", progressId, "Upload complete");
      setVaultError("");
      refreshWorkspace();
    } catch (error) {
      console.error("Failed to store scripts", error);
      if (progressId) {
        failUploadProgress("scripts", progressId, "Script upload failed");
      }
      setVaultError(
        describeVaultError(error, "Unable to save the scripts to Cloudflare R2.")
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSelection = (category, id) => {
    setSelectedItems((prev) => {
      const exists = prev.some((item) => item.category === category && item.id === id);
      if (exists) {
        return prev.filter((item) => !(item.category === category && item.id === id));
      }
      return [...prev, { category, id }];
    });
  };

  const clearSelectionFor = useCallback(
    (category, ids) => {
      setSelectedItems((prev) =>
        prev.filter((entry) => !(entry.category === category && ids.has(entry.id)))
      );
      setPreview((prevPreview) => {
        if (!prevPreview || prevPreview.category !== category) {
          return prevPreview;
        }
        return ids.has(prevPreview.item.id) ? null : prevPreview;
      });
      if (category === "scripts") {
        setCurrentScriptFolderId((currentId) => (currentId && ids.has(currentId) ? null : currentId));
      }
    },
    []
  );

  const handleFilterChange = useCallback(
    (category, value) => {
      const normalised = value ? value.toLowerCase() : null;
      setUploaderFilters((prev) => ({ ...prev, [category]: normalised }));
      setSelectedItems((prev) => prev.filter((entry) => entry.category !== category));
      setPreview((prevPreview) => {
        if (!prevPreview || prevPreview.category !== category) {
          return prevPreview;
        }
        if (!normalised) {
          return prevPreview;
        }
        const previewEmail = String(prevPreview.item?.uploaderEmail || "").toLowerCase();
        return previewEmail === normalised ? prevPreview : null;
      });
      if (category === "scripts") {
        setCurrentScriptFolderId((currentId) => {
          if (!normalised || !currentId) {
            return currentId;
          }
          const currentFolder = scriptsById.get(currentId);
          if (!currentFolder) {
            return null;
          }
          const email = String(currentFolder.uploaderEmail || "").toLowerCase();
          return email === normalised ? currentId : null;
        });
      }
    },
    [scriptsById, setCurrentScriptFolderId, setPreview, setSelectedItems, setUploaderFilters]
  );

  const handleDelete = async ({
    category,
    item,
    items,
    permanent = false,
    bulk = false,
  }) => {
    if (!storageReady) return;
    const targets = bulk ? items ?? [] : item ? [item] : [];
    if (!targets.length) return;
    const idsToClear = new Set();
    let completed = false;
    try {
      setIsProcessing(true);
      setVaultError("");

      if (category === "prompts") {
        const ids = new Set(targets.map((entry) => entry.id).filter(Boolean));
        ids.forEach((id) => idsToClear.add(id));
        const deletedAt = permanent ? null : new Date().toISOString();
        await executeVault("prompts", async (schema) => {
          const config = schema.prompts;
          const path = buildInFilterPath(config, "id", Array.from(ids));
          if (permanent) {
            await vaultRequest(path, { method: "DELETE" });
            return;
          }
          const basePayload = shapeVaultPayload(config, { deleted_at: deletedAt });
          const needsFallback = !config?.columns?.deleted_at || !Object.keys(basePayload).length;
          if (!needsFallback) {
            await vaultRequest(path, {
              method: "PATCH",
              body: JSON.stringify(basePayload),
            });
            return;
          }
          for (const entry of targets) {
            if (!entry?.id) continue;
            const canonical = {
              deleted_at: deletedAt,
              description: entry.description,
              notes: entry.notes,
              reference_name: entry.referenceName ?? null,
              reference_mime: entry.referenceMime ?? null,
              reference_size: entry.referenceSize ?? null,
              reference_content: entry.referenceContent ?? null,
            };
            const shaped = applyPromptFallbackColumns(
              config,
              shapeVaultPayload(config, canonical),
              canonical,
              entry.fallbackData
            );
            await vaultRequest(buildFilterPath(config, "id", entry.id), {
              method: "PATCH",
              body: JSON.stringify(shaped),
            });
          }
        });
        if (permanent) {
          setTrashedPrompts((prev) => prev.filter((entry) => !ids.has(entry.id)));
        } else {
          setPrompts((prev) => prev.filter((entry) => !ids.has(entry.id)));
          setTrashedPrompts((prev) => {
            const moved = targets.map((entry) => ({
              ...entry,
              deletedAt,
              category: "prompts",
            }));
            const remaining = prev.filter((entry) => !ids.has(entry.id));
            const next = [...moved, ...remaining];
            return next.sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
          });
        }
      } else if (category === "links") {
        const ids = new Set(targets.map((entry) => entry.id).filter(Boolean));
        ids.forEach((id) => idsToClear.add(id));
        const deletedAt = permanent ? null : new Date().toISOString();
        await executeVault("links", async (schema) => {
          const config = schema.links;
          const path = buildInFilterPath(config, "id", Array.from(ids));
          if (permanent) {
            await vaultRequest(path, { method: "DELETE" });
            return;
          }
          const basePayload = shapeVaultPayload(config, { deleted_at: deletedAt });
          const needsFallback = !config?.columns?.deleted_at || !Object.keys(basePayload).length;
          if (!needsFallback) {
            await vaultRequest(path, {
              method: "PATCH",
              body: JSON.stringify(basePayload),
            });
            return;
          }
          for (const entry of targets) {
            if (!entry?.id) continue;
            const canonical = {
              deleted_at: deletedAt,
              notes: entry.notes,
              reference_name: entry.referenceName ?? null,
              reference_mime: entry.referenceMime ?? null,
              reference_size: entry.referenceSize ?? null,
              reference_content: entry.referenceContent ?? null,
            };
            const shaped = applyLinkFallbackColumns(
              config,
              shapeVaultPayload(config, canonical),
              canonical,
              entry.fallbackData
            );
            await vaultRequest(buildFilterPath(config, "id", entry.id), {
              method: "PATCH",
              body: JSON.stringify(shaped),
            });
          }
        });
        if (permanent) {
          setTrashedLinks((prev) => prev.filter((entry) => !ids.has(entry.id)));
        } else {
          setLinks((prev) => prev.filter((entry) => !ids.has(entry.id)));
          setTrashedLinks((prev) => {
            const moved = targets.map((entry) => ({
              ...entry,
              deletedAt,
              category: "links",
            }));
            const remaining = prev.filter((entry) => !ids.has(entry.id));
            const next = [...moved, ...remaining];
            return next.sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
          });
        }
      } else if (category === "scripts") {
        const sourceItems = permanent ? trashedScripts : scripts;
        const branchIds = new Set();
        targets.forEach((target) => {
          const ids = collectScriptBranchIds(target.id, sourceItems);
          ids.forEach((value) => branchIds.add(value));
        });
        const idValues = Array.from(branchIds).filter(Boolean);
        idValues.forEach((value) => idsToClear.add(value));
        if (idValues.length) {
          const deletedAt = permanent ? null : new Date().toISOString();
          await executeVault("scripts", async (schema) => {
            const config = schema.scripts;
            const filter = buildInFilterPath(config, "id", idValues);
            if (permanent) {
              await vaultRequest(filter, { method: "DELETE" });
            } else {
              const basePayload = shapeVaultPayload(config, { deleted_at: deletedAt });
              const needsFallback = !config?.columns?.deleted_at || !Object.keys(basePayload).length;
              if (!needsFallback) {
                await vaultRequest(filter, {
                  method: "PATCH",
                  body: JSON.stringify(basePayload),
                });
              } else {
                const source = permanent ? trashedScripts : scripts;
                for (const value of idValues) {
                  const entry = source.find((item) => item.id === value) ?? scriptsById.get(value);
                  if (!entry) continue;
                  const canonical = {
                    deleted_at: deletedAt,
                    notes: entry.notes,
                    reference_name: entry.referenceName ?? null,
                    reference_mime: entry.referenceMime ?? null,
                    reference_size: entry.referenceSize ?? null,
                    reference_content: entry.referenceContent ?? null,
                  };
                  const shaped = applyScriptFallbackColumns(
                    config,
                    shapeVaultPayload(config, canonical),
                    canonical,
                    entry.fallbackData
                  );
                  await vaultRequest(buildFilterPath(config, "id", value), {
                    method: "PATCH",
                    body: JSON.stringify(shaped),
                  });
                }
              }
            }
          });
          if (permanent) {
            setTrashedScripts((prev) => prev.filter((entry) => !branchIds.has(entry.id)));
          } else {
            const moved = scripts.filter((entry) => branchIds.has(entry.id));
            setScripts((prev) => prev.filter((entry) => !branchIds.has(entry.id)));
            setTrashedScripts((prev) => {
              const next = [
                ...moved.map((entry) => ({ ...entry, deletedAt, category: "scripts" })),
                ...prev.filter((entry) => !branchIds.has(entry.id)),
              ];
              return next.sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
            });
          }
        }
      }

      if (idsToClear.size) {
        clearSelectionFor(category, idsToClear);
      }
      setVaultError("");
      completed = true;
    } catch (error) {
      console.error("Failed to delete item", error);
      setVaultError(
        describeVaultError(error, "Unable to delete the item from Cloudflare R2.")
      );
    } finally {
      setIsProcessing(false);
      if (completed) {
        setPendingDelete(null);
        refreshWorkspace();
      }
    }
  };

  const handleRestore = async ({ category, item }) => {
    if (!storageReady || !item) return;
    try {
      setIsProcessing(true);
      setVaultError("");

      if (category === "prompts") {
        await executeVault("prompts", async (schema) => {
          const config = schema.prompts;
          const path = buildFilterPath(config, "id", item.id);
          const basePayload = shapeVaultPayload(config, { deleted_at: null });
          const needsFallback = !config?.columns?.deleted_at || !Object.keys(basePayload).length;
          if (!needsFallback) {
            await vaultRequest(path, {
              method: "PATCH",
              body: JSON.stringify(basePayload),
            });
            return;
          }
          const canonical = {
            deleted_at: null,
            description: item.description,
            notes: item.notes,
            reference_name: item.referenceName ?? null,
            reference_mime: item.referenceMime ?? null,
            reference_size: item.referenceSize ?? null,
            reference_content: item.referenceContent ?? null,
          };
          const shaped = applyPromptFallbackColumns(
            config,
            shapeVaultPayload(config, canonical),
            canonical,
            item.fallbackData
          );
          await vaultRequest(path, {
            method: "PATCH",
            body: JSON.stringify(shaped),
          });
        });
        const { category: _omit, ...restored } = { ...item, deletedAt: null };
        setTrashedPrompts((prev) => prev.filter((entry) => entry.id !== item.id));
        setPrompts((prev) => {
          const existing = prev.filter((entry) => entry.id !== restored.id);
          const next = [...existing, restored];
          return next.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        });
      } else if (category === "links") {
        await executeVault("links", async (schema) => {
          const config = schema.links;
          const path = buildFilterPath(config, "id", item.id);
          const basePayload = shapeVaultPayload(config, { deleted_at: null });
          const needsFallback = !config?.columns?.deleted_at || !Object.keys(basePayload).length;
          if (!needsFallback) {
            await vaultRequest(path, {
              method: "PATCH",
              body: JSON.stringify(basePayload),
            });
            return;
          }
          const canonical = {
            deleted_at: null,
            notes: item.notes,
            reference_name: item.referenceName ?? null,
            reference_mime: item.referenceMime ?? null,
            reference_size: item.referenceSize ?? null,
            reference_content: item.referenceContent ?? null,
          };
          const shaped = applyLinkFallbackColumns(
            config,
            shapeVaultPayload(config, canonical),
            canonical,
            item.fallbackData
          );
          await vaultRequest(path, {
            method: "PATCH",
            body: JSON.stringify(shaped),
          });
        });
        const { category: _omit, ...restored } = { ...item, deletedAt: null };
        setTrashedLinks((prev) => prev.filter((entry) => entry.id !== item.id));
        setLinks((prev) => {
          const existing = prev.filter((entry) => entry.id !== restored.id);
          const next = [...existing, restored];
          return next.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        });
      } else if (category === "scripts") {
        const ids = collectScriptBranchIds(item.id, trashedScripts);
        const idColumn = vaultSchema.scripts.columns.id ?? "id";
        const idList = Array.from(ids)
          .map((value) => `"${value}"`)
          .join(",");
        const encodedValues = encodeURIComponent(`(${idList})`);
        await executeVault("scripts", async (schema) => {
          const config = schema.scripts;
          const path = `${config.table}?${encodeURIComponent(idColumn)}=in.${encodedValues}`;
          const basePayload = shapeVaultPayload(config, { deleted_at: null });
          const needsFallback = !config?.columns?.deleted_at || !Object.keys(basePayload).length;
          if (!needsFallback) {
            await vaultRequest(path, {
              method: "PATCH",
              body: JSON.stringify(basePayload),
            });
            return;
          }
          for (const value of ids) {
            const entry = trashedScriptsById.get(value);
            if (!entry) continue;
            const canonical = {
              deleted_at: null,
              notes: entry.notes,
              reference_name: entry.referenceName ?? null,
              reference_mime: entry.referenceMime ?? null,
              reference_size: entry.referenceSize ?? null,
              reference_content: entry.referenceContent ?? null,
            };
            const shaped = applyScriptFallbackColumns(
              config,
              shapeVaultPayload(config, canonical),
              canonical,
              entry.fallbackData
            );
            await vaultRequest(buildFilterPath(config, "id", value), {
              method: "PATCH",
              body: JSON.stringify(shaped),
            });
          }
        });
        const restoredEntries = Array.from(ids)
          .map((id) => trashedScriptsById.get(id))
          .filter(Boolean)
          .map((entry) => {
            const { category: _omit, ...rest } = entry;
            return { ...rest, deletedAt: null };
          });
        setTrashedScripts((prev) => prev.filter((entry) => !ids.has(entry.id)));
        setScripts((prev) => {
          const remaining = prev.filter((entry) => !ids.has(entry.id));
          return [...remaining, ...restoredEntries];
        });
      }

      setVaultError("");
      refreshWorkspace();
    } catch (error) {
      console.error("Failed to restore item", error);
      setVaultError(
        describeVaultError(error, "Unable to restore the item in Cloudflare R2.")
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const scriptPath = (item) => {
    const segments = [item.name];
    let parent = item.parentId ? scriptsById.get(item.parentId) : null;
    while (parent) {
      segments.push(parent.name);
      parent = parent.parentId ? scriptsById.get(parent.parentId) : null;
    }
    return segments.reverse();
  };

  const gatherScriptEntries = useCallback(
    async (item, prefixSegments = [], seenDirectories = new Set()) => {
      const entries = [];
      const pathSegments = [...prefixSegments, item.name];
      if (item.type === "folder") {
        const folderPath = `${pathSegments.join("/")}/`;
        if (!seenDirectories.has(folderPath)) {
          entries.push({
            path: folderPath,
            data: new Uint8Array(0),
            crc: 0,
            isDirectory: true,
            date: new Date(item.createdAt),
            externalAttr: 0x10 << 16,
          });
          seenDirectories.add(folderPath);
        }
        if (item.referenceContent && item.referenceName) {
          const referenceDirPath = `${[...pathSegments, "Reference"].join("/")}/`;
          if (!seenDirectories.has(referenceDirPath)) {
            entries.push({
              path: referenceDirPath,
              data: new Uint8Array(0),
              crc: 0,
              isDirectory: true,
              date: new Date(item.createdAt),
              externalAttr: 0x10 << 16,
            });
            seenDirectories.add(referenceDirPath);
          }
          const refBuffer = await loadStorageBinary(item.referenceContent);
          entries.push({
            path: [...pathSegments, "Reference", item.referenceName].join("/"),
            data: refBuffer,
            crc: crc32(refBuffer),
            date: new Date(item.createdAt),
          });
        }
        const children = scripts.filter((child) => child.parentId === item.id);
        for (const child of children) {
          const childEntries = await gatherScriptEntries(child, pathSegments, seenDirectories);
          entries.push(...childEntries);
        }
        return entries;
      }
      const buffer = await loadStorageBinary(item.content);
      entries.push({
        path: pathSegments.join("/"),
        data: buffer,
        crc: crc32(buffer),
        date: new Date(item.createdAt),
      });
      if (item.referenceContent && item.referenceName) {
        const parentSegments = pathSegments.slice(0, -1);
        const referenceDirPath = `${[...parentSegments, "Reference"].join("/")}/`;
        if (!seenDirectories.has(referenceDirPath)) {
          entries.push({
            path: referenceDirPath,
            data: new Uint8Array(0),
            crc: 0,
            isDirectory: true,
            date: new Date(item.createdAt),
            externalAttr: 0x10 << 16,
          });
          seenDirectories.add(referenceDirPath);
        }
        const refBuffer = await loadStorageBinary(item.referenceContent);
        entries.push({
          path: [...parentSegments, "Reference", item.referenceName].join("/"),
          data: refBuffer,
          crc: crc32(refBuffer),
          date: new Date(item.createdAt),
        });
      }
      return entries;
    },
    [scripts]
  );

  const LINK_EXPORT_FORMATS = [
    { ext: "txt", label: "Plain text (.txt)", mime: "text/plain" },
    { ext: "md", label: "Markdown (.md)", mime: "text/markdown" },
    { ext: "pdf", label: "PDF (.pdf)", mime: "application/pdf" },
    { ext: "docx", label: "Word (.docx)", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    { ext: "py", label: "Python (.py)", mime: "text/x-python" },
  ];

  const downloadReferenceAttachment = async (item) => {
    if (!item?.referenceContent || !item?.referenceName) {
      return false;
    }
    try {
      const buffer = await loadStorageBinary(item.referenceContent);
      if (!buffer?.length) {
        throw new Error("Reference attachment is empty.");
      }
      const blob = new Blob([buffer], {
        type: item.referenceMime || "application/octet-stream",
      });
      downloadBlob(blob, item.referenceName);
      return true;
    } catch (error) {
      console.error("Failed to download reference attachment", error);
      setVaultError("Unable to download the reference attachment. Please try again.");
      return false;
    }
  };

  const handleDownload = async (category, item, options = {}) => {
    if (category === "links" && !options.format) {
      setLinkDownloadTarget({ category, item });
      return;
    }
    try {
      setIsProcessing(true);
      if (category === "prompts") {
        const content = `Name: ${item.name}\nDescription: ${item.description || "-"}\nNotes: ${item.notes || "-"}\nUploaded by: ${item.uploader} (${item.uploaderEmail})`;
        downloadBlob(new Blob([content], { type: "text/plain" }), safeFileName(item.name, "txt"));
        await downloadReferenceAttachment(item);
        return;
      }
      if (category === "links") {
        const chosen = LINK_EXPORT_FORMATS.find((entry) => entry.ext === options.format) ?? LINK_EXPORT_FORMATS[0];
        const content = `Name: ${item.name}\nURL: ${item.url}\nNotes: ${item.notes || "-"}\nUploaded by: ${item.uploader} (${item.uploaderEmail})`;
        const blob = new Blob([content], { type: chosen.mime || "text/plain" });
        downloadBlob(blob, safeFileName(item.name, chosen.ext));
        await downloadReferenceAttachment(item);
        return;
      }
      if (item.type === "file") {
        const buffer = await loadStorageBinary(item.content);
        const blob = new Blob([buffer], { type: item.mimeType || "application/octet-stream" });
        downloadBlob(blob, item.name);
        await downloadReferenceAttachment(item);
        return;
      }
      const entries = await gatherScriptEntries(item);
      const zip = createZip(entries);
      downloadBlob(zip, `${safeFileName(item.name)}.zip`);
    } catch (error) {
      console.error("Failed to download item", error);
      setVaultError(
        describeVaultError(error, "Unable to download the requested item.")
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const gatherSelectionEntries = useCallback(async (selection = selectedItems) => {
    const entries = [];
    const added = new Set();

    const addEntry = (entry) => {
      if (added.has(entry.path)) return;
      added.add(entry.path);
      entries.push(entry);
    };

    const pushReferenceEntries = async (item, baseSegments) => {
      if (!item?.referenceContent || !item?.referenceName) {
        return;
      }
      const dirSegments = [...baseSegments, "Reference"];
      const dirPath = `${dirSegments.join("/")}/`;
      addEntry({
        path: dirPath,
        data: new Uint8Array(0),
        crc: 0,
        isDirectory: true,
        date: new Date(item.createdAt),
        externalAttr: 0x10 << 16,
      });
      const buffer = await loadStorageBinary(item.referenceContent);
      addEntry({
        path: [...dirSegments, item.referenceName].join("/"),
        data: buffer,
        crc: crc32(buffer),
        date: new Date(item.createdAt),
      });
    };

    for (const { category, id } of selection) {
      if (category === "prompts") {
        const prompt = prompts.find((entry) => entry.id === id);
        if (!prompt) continue;
        const filename = `Prompts/${safeFileName(prompt.name, "txt")}`;
        const content = textEncoder.encode(
          `Name: ${prompt.name}\nDescription: ${prompt.description || "-"}\nNotes: ${prompt.notes || "-"}\nUploaded by: ${prompt.uploader}`
        );
        addEntry({
          path: filename,
          data: content,
          crc: crc32(content),
          date: new Date(prompt.createdAt),
        });
        await pushReferenceEntries(prompt, ["Prompts", safeFileName(prompt.name)]);
        continue;
      }
      if (category === "links") {
        const link = links.find((entry) => entry.id === id);
        if (!link) continue;
        const filename = `Links/${safeFileName(link.name, "txt")}`;
        const content = textEncoder.encode(
          `Name: ${link.name}\nURL: ${link.url}\nNotes: ${link.notes || "-"}\nUploaded by: ${link.uploader}`
        );
        addEntry({
          path: filename,
          data: content,
          crc: crc32(content),
          date: new Date(link.createdAt),
        });
        await pushReferenceEntries(link, ["Links", safeFileName(link.name)]);
        continue;
      }
      const script = scriptsById.get(id);
      if (!script) continue;
      if (script.type === "file") {
        const buffer = await loadStorageBinary(script.content);
        addEntry({
          path: ["Scripts", ...scriptPath(script)].join("/"),
          data: buffer,
          crc: crc32(buffer),
          date: new Date(script.createdAt),
        });
        await pushReferenceEntries(script, ["Scripts", ...scriptPath(script).slice(0, -1)]);
        continue;
      }
      const baseSegments = ["Scripts", ...scriptPath(script).slice(0, -1)];
      const entriesFromFolder = await gatherScriptEntries(script, baseSegments);
      entriesFromFolder.forEach(addEntry);
    }

    return entries;
  }, [gatherScriptEntries, links, prompts, scriptsById, selectedItems]);

  const handleBulkDownload = async () => {
    if (!selectedItems.length) return;
    try {
      setIsProcessing(true);
      const entries = await gatherSelectionEntries();
      if (!entries.length) return;
      const zip = createZip(entries);
      downloadBlob(zip, `vault-bulk-download-${Date.now()}.zip`);
    } catch (error) {
      console.error("Failed to bundle download", error);
      setVaultError(
        describeVaultError(error, "Unable to build the bulk download archive.")
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDownloadForCategory = async (category) => {
    const selection = selectedItems.filter((entry) => entry.category === category);
    if (!selection.length) return;
    try {
      setIsProcessing(true);
      const entries = await gatherSelectionEntries(selection);
      if (!entries.length) return;
      const zip = createZip(entries);
      downloadBlob(zip, `${category}-bundle-${Date.now()}.zip`);
    } catch (error) {
      console.error("Failed to bundle download", error);
      setVaultError(
        describeVaultError(error, "Unable to build the bulk download archive.")
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDeleteForCategory = (category) => {
    const selection = selectedItems.filter((entry) => entry.category === category);
    if (!selection.length) {
      return;
    }
    let items = [];
    if (category === "prompts") {
      items = selection
        .map((entry) => prompts.find((prompt) => prompt.id === entry.id))
        .filter(Boolean);
    } else if (category === "links") {
      items = selection
        .map((entry) => links.find((link) => link.id === entry.id))
        .filter(Boolean);
    } else if (category === "scripts") {
      items = selection
        .map((entry) => scriptsById.get(entry.id))
        .filter(Boolean);
    }
    if (!items.length) {
      return;
    }
    setPendingDelete({ category, items, bulk: true, permanent: false });
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (!editingItem || !storageReady) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    if (!name) return;

    try {
      setIsProcessing(true);
      setVaultError("");
      if (editingItem.category === "prompts") {
        const description = String(form.get("description") || "").trim();
        await executeVault("prompts", async (schema) => {
          const canonical = {
            name,
            description,
            notes,
            reference_name: editingItem.item.referenceName ?? null,
            reference_mime: editingItem.item.referenceMime ?? null,
            reference_size: editingItem.item.referenceSize ?? null,
            reference_content: editingItem.item.referenceContent ?? null,
          };
          const updatePayload = applyPromptFallbackColumns(
            schema.prompts,
            shapeVaultPayload(schema.prompts, canonical),
            canonical,
            editingItem.item.fallbackData
          );
          await vaultRequest(buildFilterPath(schema.prompts, "id", editingItem.item.id), {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(updatePayload),
          });
        });
        setPrompts((prev) =>
          prev.map((entry) =>
            entry.id === editingItem.item.id ? { ...entry, name, description, notes } : entry
          )
        );
      } else if (editingItem.category === "links") {
        const url = String(form.get("url") || "").trim();
        await executeVault("links", async (schema) => {
          const canonical = {
            name,
            url,
            notes,
            reference_name: editingItem.item.referenceName ?? null,
            reference_mime: editingItem.item.referenceMime ?? null,
            reference_size: editingItem.item.referenceSize ?? null,
            reference_content: editingItem.item.referenceContent ?? null,
          };
          const updatePayload = applyLinkFallbackColumns(
            schema.links,
            shapeVaultPayload(schema.links, canonical),
            canonical,
            editingItem.item.fallbackData
          );
          await vaultRequest(buildFilterPath(schema.links, "id", editingItem.item.id), {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(updatePayload),
          });
        });
        setLinks((prev) =>
          prev.map((entry) => (entry.id === editingItem.item.id ? { ...entry, name, url, notes } : entry))
        );
      } else if (editingItem.category === "scripts") {
        await executeVault("scripts", async (schema) => {
          const canonical = {
            name,
            notes,
            reference_name: editingItem.item.referenceName ?? null,
            reference_mime: editingItem.item.referenceMime ?? null,
            reference_size: editingItem.item.referenceSize ?? null,
            reference_content: editingItem.item.referenceContent ?? null,
          };
          const updatePayload = applyScriptFallbackColumns(
            schema.scripts,
            shapeVaultPayload(schema.scripts, canonical),
            canonical,
            editingItem.item.fallbackData
          );
          await vaultRequest(buildFilterPath(schema.scripts, "id", editingItem.item.id), {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(updatePayload),
          });
        });
        setScripts((prev) =>
          prev.map((entry) =>
            entry.id === editingItem.item.id
              ? {
                  ...entry,
                  name,
                  notes,
                  ...(entry.type === "file" ? { originalName: entry.originalName || name } : {}),
                }
              : entry
          )
        );
      }

      setPreview((prevPreview) => {
        if (!prevPreview || prevPreview.item.id !== editingItem.item.id || prevPreview.category !== editingItem.category) {
          return prevPreview;
        }
        if (editingItem.category === "prompts") {
          const description = String(form.get("description") || "").trim();
          return { ...prevPreview, item: { ...prevPreview.item, name, description, notes } };
        }
        if (editingItem.category === "links") {
          const url = String(form.get("url") || "").trim();
          return { ...prevPreview, item: { ...prevPreview.item, name, url, notes } };
        }
        return { ...prevPreview, item: { ...prevPreview.item, name, notes } };
      });

      setEditingItem(null);
      setVaultError("");
      refreshWorkspace();
    } catch (error) {
      console.error("Failed to update item", error);
      setVaultError(
        describeVaultError(error, "Unable to update the item in Cloudflare R2.")
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleContextMenu = (event, category, item) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, category, item });
  };

  const renderListItem = (category, item) => {
    const isSelected = selectedItems.some((entry) => entry.category === category && entry.id === item.id);
    const Icon =
      category === "prompts" ? FileText : category === "links" ? Link2 : item.type === "folder" ? Folder : FileText;
    const isActivePreview = preview?.category === category && preview.item.id === item.id;
    return (
      <div
        key={item.id}
        role="button"
        tabIndex={0}
        onClick={() => setPreview({ category, item })}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setPreview({ category, item });
          }
        }}
        onContextMenu={(event) => handleContextMenu(event, category, item)}
        className={`group flex w-full items-start justify-between rounded-2xl border border-[#30363d] bg-[#0d1117] p-4 text-left transition hover:border-[#58a6ff]/40 hover:bg-[#161b22] focus:outline-none focus:ring-2 focus:ring-[#58a6ff]/40 ${
          isSelected || isActivePreview ? "border-[#58a6ff]/60 bg-[#111c2e]" : ""
        }`}
      >
        <div className="flex items-start gap-4">
          <input
            type="checkbox"
            checked={isSelected}
            onClick={(event) => event.stopPropagation()}
            onChange={() => toggleSelection(category, item.id)}
            className="mt-1 h-5 w-5 cursor-pointer rounded border-[#30363d] bg-[#161b22] text-[#58a6ff] focus:ring-[#58a6ff]"
          />
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
              category === "prompts"
                ? "bg-[#1b4728] text-[#3fb950]"
                : category === "links"
                ? "bg-[#4b1d34] text-[#f778ba]"
                : item.type === "folder"
                ? "bg-[#4d380a] text-[#f2cc60]"
                : "bg-[#0e305c] text-[#58a6ff]"
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold text-white">{item.name}</p>
              {category === "scripts" && item.type === "folder" && (
                <Badge className="rounded-full bg-[#f2cc60]/20 text-xs text-[#f2cc60]">Folder</Badge>
              )}
              {item.uploaderEmail && (
                <Badge
                  className={`rounded-full text-xs ${
                    item.uploaderEmail === currentUser?.email
                      ? "bg-[#238636]/30 text-[#3fb950]"
                      : "bg-[#0b2f53] text-[#9cc4ff]"
                  }`}
                >
                  {item.uploaderEmail}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Uploaded by {item.uploader} • {formatDateTime(item.createdAt)}
            </p>
            {category === "prompts" && item.description && (
              <p className="mt-2 text-sm text-slate-300">{item.description}</p>
            )}
            {item.pathLabel && (
              <p className="mt-2 text-xs text-slate-400">Location: {item.pathLabel}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:bg-[#1f6feb]/10 hover:text-white"
            onClick={(event) => {
              event.stopPropagation();
              handleContextMenu(event, category, item);
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const renderUploaderFilter = (category, options) => (
    <label className="flex items-center gap-3 text-sm text-slate-300">
      <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-400">Sort/Filter</span>
      <select
        value={uploaderFilters[category] ?? ""}
        onChange={(event) => handleFilterChange(category, event.target.value || null)}
        className="rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-slate-100 focus:border-[#58a6ff] focus:outline-none"
      >
        <option value="">All uploads</option>
        {options.map((email) => (
          <option key={email} value={email}>
            {email}
          </option>
        ))}
      </select>
    </label>
  );

  const renderUploadProgressBar = (category) => {
    const progress = uploadProgress[category];
    if (!progress) {
      return null;
    }
    const percent = Math.round(progress.value ?? 0);
    const barColor =
      progress.status === "error"
        ? "bg-[#f85149]"
        : progress.status === "complete"
        ? "bg-[#238636]"
        : "bg-[#1f6feb]";
    return (
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 text-sm text-slate-200">
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>{progress.label}</span>
          {progress.status !== "error" && <span>{percent}%</span>}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#0d1117]">
          <div
            className={`${barColor} h-full transition-all`}
            style={{ width: `${Math.min(100, Math.max(0, progress.value ?? 0))}%` }}
          />
        </div>
        {progress.status === "error" && (
          <p className="mt-2 text-xs text-rose-300">
            Upload failed. Please resolve the issue and try again.
          </p>
        )}
      </div>
    );
  };

  const renderReferenceBlock = (item) => {
    if (!item?.referenceContent || !item?.referenceName) {
      return null;
    }
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">Reference</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#30363d] bg-[#161b22] p-3">
          <div>
            <p className="text-sm font-semibold text-white">{item.referenceName}</p>
            <p className="text-xs text-slate-400">
              {(item.referenceMime && item.referenceMime.length ? item.referenceMime : "Unknown type")}
              {" "}• {formatFileSize(item.referenceSize)}
            </p>
          </div>
          <Button
            type="button"
                  onClick={async () => {
                    await downloadReferenceAttachment(item);
                  }}
            className="bg-[#1f6feb] text-white hover:bg-[#388bfd]"
          >
            <Download className="mr-2 h-4 w-4" /> Reference
          </Button>
        </div>
      </div>
    );
  };

  const renderPreview = (categoryFilter = null) => {
    if (!preview || (categoryFilter && preview.category !== categoryFilter)) {
      const label = categoryFilter ? categoryFilter.charAt(0).toUpperCase() + categoryFilter.slice(1) : "item";
      return (
        <Card className="border-[#30363d] bg-[#0d1117] text-white">
          <CardContent className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center text-slate-400">
            <Database className="h-10 w-10 text-slate-500" />
            <p className="max-w-xs text-sm">Select a {label.toLowerCase()} to preview its notes and metadata.</p>
          </CardContent>
        </Card>
      );
    }

    const { category, item } = preview;
    return (
      <Card className="border-[#30363d] bg-[#0d1117] text-white">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-white">{item.name}</CardTitle>
            <p className="mt-1 text-xs text-slate-400">
              Uploaded by {item.uploader} • {formatDateTime(item.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {item.uploaderEmail && (
              <Badge
                className={`rounded-full text-xs ${
                  item.uploaderEmail === currentUser?.email
                    ? "bg-[#238636]/30 text-[#3fb950]"
                    : "bg-[#0b2f53] text-[#9cc4ff]"
                }`}
              >
                {item.uploaderEmail}
              </Badge>
            )}
            <Badge className="bg-[#161b22] text-xs text-slate-200">{category.toUpperCase()}</Badge>
            {category === "scripts" && item.type === "folder" && (
              <Badge className="bg-[#4d380a] text-xs text-[#f2cc60]">Folder</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {category === "prompts" && (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Description</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-[#30363d] bg-[#161b22] p-3 text-sm text-slate-100">
                  {item.description || "No description provided."}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Notes</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-[#30363d] bg-[#161b22] p-3 text-sm text-slate-100">
                  {item.notes || "No notes yet."}
                </p>
              </div>
              {renderReferenceBlock(item)}
            </div>
          )}
          {category === "links" && (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">URL</p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-2 rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-[#58a6ff] hover:bg-[#1b2330]"
                >
                  {item.url}
                </a>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Notes</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-[#30363d] bg-[#161b22] p-3 text-sm text-slate-100">
                  {item.notes || "No notes yet."}
                </p>
              </div>
              {renderReferenceBlock(item)}
            </div>
          )}
          {category === "scripts" && (
            <div className="space-y-4">
              {item.type === "file" ? (
                <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4 text-sm text-slate-300">
                  <p className="font-semibold text-white">File details</p>
                  <p className="mt-2">Original name: {item.originalName || item.name}</p>
                  <p>Size: {item.size ? `${(item.size / 1024).toFixed(1)} KB` : "Unknown"}</p>
                  <p>Type: {item.mimeType}</p>
                </div>
              ) : (
                <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4 text-sm text-slate-300">
                  <p className="font-semibold text-white">Folder contents</p>
                  <div className="mt-3 space-y-2">
                    {scripts
                      .filter((child) => child.parentId === item.id)
                      .map((child) => (
                        <p key={child.id} className="flex items-center gap-2 text-slate-300">
                          {child.type === "folder" ? (
                            <Folder className="h-4 w-4 text-[#f2cc60]" />
                          ) : (
                            <FileText className="h-4 w-4 text-[#58a6ff]" />
                          )}
                          {child.name}
                        </p>
                      ))}
                    {!scripts.some((child) => child.parentId === item.id) && (
                      <p className="text-xs text-slate-500">This folder is empty.</p>
                    )}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Notes</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-[#30363d] bg-[#161b22] p-3 text-sm text-slate-100">
                  {item.notes || "No notes yet."}
                </p>
              </div>
              {renderReferenceBlock(item)}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={async () => handleDownload(category, item)}
              disabled={isBusy}
              className="bg-[#1f6feb] text-white hover:bg-[#388bfd] disabled:cursor-not-allowed disabled:bg-[#161b22] disabled:text-slate-500"
            >
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditingItem({ category, item })}
              disabled={isBusy}
              className="border-[#30363d] bg-[#161b22] text-white hover:bg-[#1b2330] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PencilLine className="mr-2 h-4 w-4" /> Edit details
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderEditDrawer = () => {
    if (!editingItem) return null;
    const { category, item } = editingItem;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#0d1117] p-6 shadow-2xl">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-semibold text-white">Edit {category.slice(0, 1).toUpperCase() + category.slice(1)}</h3>
              <p className="mt-1 text-sm text-slate-400">Update the name or notes for this entry.</p>
            </div>
            <button
              onClick={() => setEditingItem(null)}
              className="rounded-full p-2 text-slate-400 hover:bg-[#161b22] hover:text-white"
            >
              ✕
            </button>
          </div>
          <form onSubmit={handleEditSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Name</label>
              <Input
                name="name"
                defaultValue={item.name}
                className="mt-2"
              />
            </div>
            {category === "prompts" && (
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Description</label>
                <Textarea
                  name="description"
                  defaultValue={item.description}
                  className="mt-2 min-h-[100px]"
                />
              </div>
            )}
            {category === "links" && (
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">URL</label>
                <Input
                  name="url"
                  defaultValue={item.url}
                  className="mt-2"
                />
              </div>
            )}
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Notes</label>
              <Textarea
                name="notes"
                defaultValue={item.notes}
                className="mt-2 min-h-[120px]"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                onClick={() => setEditingItem(null)}
                variant="outline"
                className="border-[#30363d] bg-[#161b22] text-white hover:bg-[#1b2330]"
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-[#238636] text-white hover:bg-[#2ea043]">
                Save changes
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderContextMenu = () => {
    if (!contextMenu) return null;
    const { x, y, category, item } = contextMenu;
    return (
      <div
        ref={contextMenuRef}
        className="fixed z-40 w-48 rounded-xl border border-white/10 bg-[#0d1117] p-2 shadow-xl"
        style={{ left: x, top: y }}
      >
        <button
          onClick={async () => {
            await handleDownload(category, item);
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-[#1b2330]"
        >
          <Download className="h-4 w-4" /> Download
        </button>
        <button
          onClick={() => {
            setEditingItem({ category, item });
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-[#1b2330]"
        >
          <PencilLine className="h-4 w-4" /> Edit
        </button>
        <button
          onClick={() => {
            setPendingDelete({ category, item, permanent: false });
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-500/20"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
      </div>
    );
  };

  const renderLinkDownloadDialog = () => {
    if (!linkDownloadTarget) return null;
    const { item } = linkDownloadTarget;
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-8">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-[#30363d] bg-[#0d1117] p-6 text-slate-100 shadow-2xl">
          <div>
            <h3 className="text-lg font-semibold text-white">Download link entry</h3>
            <p className="mt-1 text-sm text-slate-400">
              Choose the export format for <span className="font-medium text-white">{item.name}</span>. The link details will be saved using structured text with the selected extension.
            </p>
          </div>
          <div className="space-y-2">
            {LINK_EXPORT_FORMATS.map((format) => (
              <button
                key={format.ext}
                onClick={async () => {
                  const target = linkDownloadTarget;
                  setLinkDownloadTarget(null);
                  await handleDownload("links", target.item, { format: format.ext });
                }}
                className="flex w-full items-center justify-between rounded-xl border border-[#30363d] bg-[#161b22] px-4 py-3 text-left text-sm text-slate-100 transition hover:border-[#58a6ff]/50 hover:bg-[#1b2330]"
              >
                <span className="font-medium text-white">{format.label}</span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            ))}
          </div>
          <Button
            onClick={() => setLinkDownloadTarget(null)}
            variant="outline"
            className="w-full border-[#30363d] bg-[#161b22] text-slate-200 hover:bg-[#1b2330]"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  const renderDeleteConfirm = () => {
    if (!pendingDelete) return null;
    const { category, item, items, permanent, bulk } = pendingDelete;
    const total = bulk ? (items?.length ?? 0) : 1;
    const targetName = bulk
      ? `${total} ${category}${total === 1 ? " entry" : " entries"}`
      : item?.name || "this item";
    const scopeLabel = bulk
      ? `the selected ${category} entries`
      : `the selected ${category} entry`;
    const actionLabel = permanent ? "permanently delete" : "move to the bin";
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-[#30363d] bg-[#0d1117] p-6 text-slate-100 shadow-2xl">
          <div>
            <h3 className="text-lg font-semibold text-white">Do you want to delete?</h3>
            <p className="mt-2 text-sm text-slate-400">
              Are you sure you want to {actionLabel} <span className="text-white">{targetName}</span>? This action applies to {scopeLabel}.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setPendingDelete(null)}
              className="border-[#30363d] bg-[#161b22] text-slate-200 hover:bg-[#1b2330]"
            >
              No
            </Button>
            <Button
              onClick={() => handleDelete(pendingDelete)}
              className="bg-[#bf3989] text-white hover:bg-[#f778ba]"
              disabled={isBusy}
            >
              Yes
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderAuthScreen = () => (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#010409] via-[#0d1117] to-[#1f6feb]/30 px-6 py-12 text-white">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#238636]/20 text-[#3fb950]">
            <Lock className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-3xl font-bold">VaultHub Login</h1>
          <p className="mt-2 text-sm text-slate-300">
            Securely store prompts, scripts, and research links for your creative team. Only approved email addresses can register.
          </p>
        </div>
        <Card className="border-white/10 bg-[#0d1117] text-white shadow-2xl">
          <CardContent className="space-y-6 pt-6">
            <div className="flex rounded-full border border-[#30363d] bg-[#161b22] p-1 text-sm">
              <button
                onClick={() => {
                  setAuthView("login");
                  setAuthError("");
                }}
                className={`flex-1 rounded-full px-4 py-2 font-medium transition ${
                  authView === "login" ? "bg-[#238636] text-white" : "text-slate-200 hover:bg-[#1b2330]"
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <LogIn className="h-4 w-4" /> Login
                </div>
              </button>
              <button
                onClick={() => {
                  setAuthView("register");
                  setAuthError("");
                }}
                className={`flex-1 rounded-full px-4 py-2 font-medium transition ${
                  authView === "register" ? "bg-[#1f6feb] text-white" : "text-slate-200 hover:bg-[#1b2330]"
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <UserPlus className="h-4 w-4" /> Register
                </div>
              </button>
            </div>
            {authError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
                {authError}
              </div>
            )}
            <form onSubmit={handleAuth} className="space-y-4">
              {authView === "register" && (
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">Name</label>
                  <Input
                    name="name"
                    placeholder="How should we call you?"
                    className="mt-1"
                  />
                </div>
              )}
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Email</label>
                <Input
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Password</label>
                <Input
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  className="mt-1"
                  required
                />
              </div>
              <Button type="submit" className="w-full bg-[#238636] text-white hover:bg-[#2ea043]">
                {authView === "login" ? (
                  <span className="flex items-center justify-center gap-2">
                    <LogIn className="h-4 w-4" /> Access vault
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <UserPlus className="h-4 w-4" /> Create vault account
                  </span>
                )}
              </Button>
            </form>
            <p className="text-center text-xs text-slate-400">
              Need access? Ask an administrator to approve your email from the admin control room.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderAdminPanel = () => (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Admin Control Room</h2>
          <p className="mt-1 text-sm text-slate-300">
            Manage who can register, review members, and keep your workspace secure.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="bg-[#238636]/20 text-[#3fb950]">
            <ShieldCheck className="mr-2 h-4 w-4" /> Administrator
          </Badge>
          <Button
            variant="outline"
            className="border-[#30363d] bg-[#161b22] text-[#c9d1d9] hover:bg-[#1f6feb]/20"
            onClick={() => setActiveView("dashboard")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to dashboard
          </Button>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-white/10 bg-[#0d1117] text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Users className="h-5 w-5 text-[#58a6ff]" /> Approved email addresses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!storageReady) return;
                const formElement = event.currentTarget;
                const form = new FormData(formElement);
                const email = String(form.get("email") || "").trim().toLowerCase();
                if (!email || allowedEmails.includes(email)) return;
                try {
                  setIsProcessing(true);
                  setVaultError("");
                  await executeVault("allowed_emails", async (schema) => {
                    const payload = shapeVaultPayload(schema.allowed_emails, {
                      email,
                      role: "member",
                      created_at: new Date().toISOString(),
                    });
                    await vaultRequest(schema.allowed_emails.table, {
                      method: "POST",
                      headers: { Prefer: "resolution=ignore-duplicates" },
                      body: JSON.stringify([payload]),
                    });
                  });
                  setAllowedEmails((prev) =>
                    Array.from(new Set([...prev, email])).sort((a, b) => a.localeCompare(b))
                  );
                  formElement?.reset();
                  refreshWorkspace();
                } catch (error) {
                  console.error("Failed to store allowed email", error);
                  setVaultError(
                    describeVaultError(
                      error,
                      "Unable to save the approved email in Cloudflare R2."
                    )
                  );
                } finally {
                  setIsProcessing(false);
                }
              }}
            >
              <Input
                name="email"
                type="email"
                placeholder="new.teammate@example.com"
                className="flex-1"
                required
              />
              <Button
                type="submit"
                disabled={isBusy || !storageReady}
                className="bg-[#1f6feb] text-white hover:bg-[#388bfd] disabled:cursor-not-allowed disabled:bg-[#1f6feb]/40 disabled:text-slate-500"
              >
                Grant access
              </Button>
            </form>
            <div className="space-y-2">
              {allowedEmails.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between rounded-xl border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm"
                >
                  <span className="text-slate-200">{email}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={protectedAdminEmails.has(email) || isBusy || !storageReady}
                    className="text-rose-300 hover:bg-rose-500/20 hover:text-rose-100 disabled:cursor-not-allowed disabled:text-slate-500"
                    onClick={async () => {
                      if (protectedAdminEmails.has(email) || !storageReady) return;
                      try {
                        setIsProcessing(true);
                        setVaultError("");
                        await vaultRequest(
                          buildFilterPath(vaultSchema.allowed_emails, "email", email),
                          { method: "DELETE" }
                        );
                        setAllowedEmails((prev) => prev.filter((entry) => entry !== email));
                        refreshWorkspace();
                      } catch (error) {
                        console.error("Failed to remove allowed email", error);
                        setVaultError(
                          describeVaultError(
                            error,
                            "Unable to remove the approved email from Cloudflare R2."
                          )
                        );
                      } finally {
                        setIsProcessing(false);
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {!allowedEmails.length && (
                <p className="text-sm text-slate-500">No email addresses have been approved yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-[#0d1117] text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <ShieldCheck className="h-5 w-5 text-[#3fb950]" /> Vault members
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between rounded-xl border border-[#30363d] bg-[#161b22] px-4 py-3"
              >
                <div>
                  <p className="font-semibold text-white">{user.name}</p>
                  <p className="text-xs text-slate-400">{user.email}</p>
                </div>
                <Badge className={`rounded-full ${user.role === "admin" ? "bg-[#238636]/20 text-[#3fb950]" : "bg-[#1b2330] text-slate-200"}`}>
                  {user.role === "admin" ? "Admin" : "Member"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );


const renderScriptsTab = () => {
  const selectedCount = selectedCounts.scripts;
  const scriptSearchActive =
    isSearchActiveForCategory("scripts") && (searchQuery || searchConfig.mode === "user");
  const scriptEmptyCopy = (() => {
    if (scriptSearchActive) {
      if (searchConfig.mode === "user" && searchConfig.user) {
        return {
          title: `No scripts uploaded by ${searchConfig.user}.`,
          description:
            "Try another teammate or clear the user filter to browse every script.",
        };
      }
      if (searchConfig.display) {
        return {
          title: `No scripts match “${searchConfig.display}”.`,
          description: "Try another keyword or clear the filters to see more scripts.",
        };
      }
      return {
        title: "No scripts match the current filters.",
        description: "Adjust the filters or clear the search to explore all scripts.",
      };
    }
    if (uploaderFilters.scripts) {
      return {
        title: "No scripts for this teammate",
        description:
          "Select another teammate or clear the filter to explore all available scripts.",
      };
    }
    return {
      title: "This folder is empty",
      description: "Upload a file or folder to populate this space.",
    };
  })();
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <Card className="border-[#30363d] bg-[#0d1117] text-white">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-white">
              <UploadCloud className="h-5 w-5 text-[#58a6ff]" /> Upload scripts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
              <span className="rounded-full border border-[#30363d] bg-[#161b22] px-3 py-1 text-xs uppercase tracking-wide">
                {scriptMode === "file" ? "Single upload" : "Folder upload"}
              </span>
              <div className="flex rounded-full border border-[#30363d] bg-[#161b22] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setScriptMode("file");
                    setScriptFolderFiles([]);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    scriptMode === "file" ? "bg-[#1f6feb] text-white" : "text-slate-300 hover:bg-[#1b2330]"
                  }`}
                >
                  Script file
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScriptMode("folder");
                    setScriptFiles([]);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    scriptMode === "folder" ? "bg-[#238636] text-white" : "text-slate-300 hover:bg-[#1b2330]"
                  }`}
                >
                  Script folder
                </button>
              </div>
            </div>

            <form onSubmit={handleAddScript} className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-4">
                  <Input
                    name="name"
                    placeholder={scriptMode === "file" ? "Display name" : "Folder name"}
                    className="bg-[#161b22]"
                  />
                  <Textarea
                    name="notes"
                    placeholder="Context, setup steps, secrets, etc."
                    className="min-h-[140px] bg-[#161b22]"
                  />
                </div>
                <div className="space-y-3">
                  {scriptMode === "file" ? (
                    <Input
                      type="file"
                      onChange={(event) => setScriptFiles(Array.from(event.target.files || []))}
                      className="bg-[#161b22] file:mr-3 file:rounded-lg file:border-0 file:bg-[#1f6feb] file:px-4 file:py-2 file:text-sm file:text-white"
                      required
                    />
                  ) : (
                    <div className="space-y-2">
                      <Input
                        ref={folderInputRef}
                        type="file"
                        multiple
                        onChange={(event) => setScriptFolderFiles(Array.from(event.target.files || []))}
                        className="bg-[#161b22] file:mr-3 file:rounded-lg file:border-0 file:bg-[#1f6feb] file:px-4 file:py-2 file:text-sm file:text-white"
                        required
                      />
                      {scriptFolderFiles.length > 0 && (
                        <p className="text-xs text-slate-400">{scriptFolderFiles.length} items ready to upload</p>
                      )}
                    </div>
                  )}
                  {scriptMode === "file" && scriptFiles.length > 0 && (
                    <p className="text-xs text-slate-400">Selected: {scriptFiles[0].name}</p>
                  )}
                  <div>
                    <label className="text-xs uppercase tracking-wide text-slate-400">Reference (optional)</label>
                    <Input
                      name="reference"
                      type="file"
                      accept="*/*"
                      className="mt-1 bg-[#161b22] file:mr-3 file:rounded-lg file:border-0 file:bg-[#1f6feb] file:px-4 file:py-2 file:text-sm file:text-white"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Upload guides, walkthroughs, or demo assets that complement this script.
                    </p>
                  </div>
                </div>
              </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isBusy || !storageReady}
                className="bg-[#1f6feb] text-white hover:bg-[#388bfd] disabled:cursor-not-allowed disabled:bg-[#161b22] disabled:text-slate-500"
              >
                Upload
              </Button>
            </div>
          </form>
          {renderUploadProgressBar("scripts")}
        </CardContent>
      </Card>

        <div className="space-y-6">
          <Card className="border-[#30363d] bg-[#0d1117] text-white">
            <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-white">Scripts</CardTitle>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {renderUploaderFilter("scripts", scriptUploaders)}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    onClick={() => handleBulkDeleteForCategory("scripts")}
                    disabled={!selectedCount || isBusy || !storageReady}
                    className="bg-[#bf3989] text-white hover:bg-[#f778ba] disabled:cursor-not-allowed disabled:bg-[#161b22] disabled:text-slate-500"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Bulk delete ({selectedCount})
                  </Button>
                  <Button
                    onClick={() => handleBulkDownloadForCategory("scripts")}
                    disabled={!selectedCount || isBusy || !storageReady}
                    className="bg-[#238636] text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:bg-[#161b22] disabled:text-slate-500"
                  >
                    <Download className="mr-2 h-4 w-4" /> Bulk download ({selectedCount})
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScriptBreadcrumb breadcrumbs={scriptBreadcrumbs} onNavigate={setCurrentScriptFolderId} />
              <div className="space-y-3">
                {scriptsInView.length ? (
                  scriptsInView.map((script) => renderListItem("scripts", script))
                ) : (
                  <EmptyState
                    icon={Folder}
                    title={scriptEmptyCopy.title}
                    description={scriptEmptyCopy.description}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {renderPreview("scripts")}
        </div>
      </div>
    </div>
  );
};

const renderPromptsTab = () => {
  const selectedCount = selectedCounts.prompts;
  const promptSearchActive =
    isSearchActiveForCategory("prompts") && (searchQuery || searchConfig.mode === "user");
  const promptEmptyCopy = (() => {
    if (promptSearchActive) {
      if (searchConfig.mode === "user" && searchConfig.user) {
        return {
          title: `No prompts uploaded by ${searchConfig.user}.`,
          description: "Try a different teammate or clear the user filter to review every prompt.",
        };
      }
      if (searchConfig.display) {
        return {
          title: `No prompts match “${searchConfig.display}”.`,
          description: "Try another keyword or clear the filters to see more prompts.",
        };
      }
      return {
        title: "No prompts match the current filters.",
        description: "Adjust the filters or clear the search to explore all prompts.",
      };
    }
    if (uploaderFilters.prompts) {
      return {
        title: "No prompts for this teammate",
        description: "Choose another uploader or clear the filter to browse all prompts.",
      };
    }
    return {
      title: "No prompts yet",
      description: "Add your first prompt to keep it handy for future sessions.",
    };
  })();
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card className="border-[#30363d] bg-[#0d1117] text-white">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-white">
              <FileText className="h-5 w-5 text-[#3fb950]" /> Save a prompt
            </CardTitle>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleAddPrompt} className="space-y-4">
            <Input name="name" placeholder="Prompt title" required className="bg-[#161b22]" />
            <Textarea
              name="description"
              placeholder="Description"
              className="min-h-[100px] bg-[#161b22]"
            />
            <Textarea
              name="notes"
              placeholder="Full prompt or reminders"
              className="min-h-[160px] bg-[#161b22]"
            />
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Reference (optional)</label>
              <Input
                name="reference"
                type="file"
                accept="*/*"
                className="mt-1 bg-[#161b22] file:mr-3 file:rounded-lg file:border-0 file:bg-[#1f6feb] file:px-4 file:py-2 file:text-sm file:text-white"
              />
              <p className="mt-1 text-xs text-slate-500">
                Attach screenshots, documents, or other helpers teammates should review.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isBusy || !storageReady}
                className="bg-[#238636] text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:bg-[#161b22] disabled:text-slate-500"
              >
                Save prompt
              </Button>
            </div>
          </form>
          {renderUploadProgressBar("prompts")}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-[#30363d] bg-[#0d1117] text-white">
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-white">Prompt library</CardTitle>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {renderUploaderFilter("prompts", promptUploaders)}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  onClick={() => handleBulkDeleteForCategory("prompts")}
                  disabled={!selectedCount || isBusy || !storageReady}
                  className="bg-[#bf3989] text-white hover:bg-[#f778ba] disabled:cursor-not-allowed disabled:bg-[#161b22] disabled:text-slate-500"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Bulk delete ({selectedCount})
                </Button>
                <Button
                  onClick={() => handleBulkDownloadForCategory("prompts")}
                  disabled={!selectedCount || isBusy || !storageReady}
                  className="bg-[#238636] text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:bg-[#161b22] disabled:text-slate-500"
                >
                  <Download className="mr-2 h-4 w-4" /> Bulk download ({selectedCount})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredPrompts.length ? (
              filteredPrompts
                .slice()
                .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                .map((prompt) => renderListItem("prompts", prompt))
            ) : (
              <EmptyState
                icon={FileText}
                title={promptEmptyCopy.title}
                description={promptEmptyCopy.description}
              />
            )}
          </CardContent>
        </Card>

        {renderPreview("prompts")}
      </div>
    </div>
  );
};

const renderLinksTab = () => {
  const selectedCount = selectedCounts.links;
  const linkSearchActive =
    isSearchActiveForCategory("links") && (searchQuery || searchConfig.mode === "user");
  const linkEmptyCopy = (() => {
    if (linkSearchActive) {
      if (searchConfig.mode === "user" && searchConfig.user) {
        return {
          title: `No links uploaded by ${searchConfig.user}.`,
          description: "Try another teammate or clear the user filter to browse every link.",
        };
      }
      if (searchConfig.display) {
        return {
          title: `No links match “${searchConfig.display}”.`,
          description: "Try another keyword or clear the filters to see more links.",
        };
      }
      return {
        title: "No links match the current filters.",
        description: "Adjust the filters or clear the search to explore all saved links.",
      };
    }
    if (uploaderFilters.links) {
      return {
        title: "No links for this teammate",
        description: "Select a different uploader or clear the filter to view all saved links.",
      };
    }
    return {
      title: "No links saved",
      description: "Keep your go-to resources a click away by adding them here.",
    };
  })();
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card className="border-[#30363d] bg-[#0d1117] text-white">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-white">
              <Link2 className="h-5 w-5 text-[#f778ba]" /> Save a link
            </CardTitle>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleAddLink} className="space-y-4">
            <Input name="name" placeholder="Resource name" required className="bg-[#161b22]" />
            <Input name="url" type="url" placeholder="https://" required className="bg-[#161b22]" />
            <Textarea
              name="notes"
              placeholder="Why this link matters"
              className="min-h-[140px] bg-[#161b22]"
            />
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Reference (optional)</label>
              <Input
                name="reference"
                type="file"
                accept="*/*"
                className="mt-1 bg-[#161b22] file:mr-3 file:rounded-lg file:border-0 file:bg-[#1f6feb] file:px-4 file:py-2 file:text-sm file:text-white"
              />
              <p className="mt-1 text-xs text-slate-500">
                Include demos or assets so teammates know how to use this link.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isBusy || !storageReady}
                className="bg-[#bf3989] text-white hover:bg-[#f778ba] disabled:cursor-not-allowed disabled:bg-[#161b22] disabled:text-slate-500"
              >
                Save link
              </Button>
            </div>
          </form>
          {renderUploadProgressBar("links")}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-[#30363d] bg-[#0d1117] text-white">
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-white">Link directory</CardTitle>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {renderUploaderFilter("links", linkUploaders)}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  onClick={() => handleBulkDeleteForCategory("links")}
                  disabled={!selectedCount || isBusy || !storageReady}
                  className="bg-[#bf3989] text-white hover:bg-[#f778ba] disabled:cursor-not-allowed disabled:bg-[#161b22] disabled:text-slate-500"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Bulk delete ({selectedCount})
                </Button>
                <Button
                  onClick={() => handleBulkDownloadForCategory("links")}
                  disabled={!selectedCount || isBusy || !storageReady}
                  className="bg-[#238636] text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:bg-[#161b22] disabled:text-slate-500"
                >
                  <Download className="mr-2 h-4 w-4" /> Bulk download ({selectedCount})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredLinks.length ? (
              filteredLinks
                .slice()
                .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                .map((link) => renderListItem("links", link))
            ) : (
              <EmptyState
                icon={Link2}
                title={linkEmptyCopy.title}
                description={linkEmptyCopy.description}
              />
            )}
          </CardContent>
        </Card>

        {renderPreview("links")}
      </div>
    </div>
  );
};

const renderBinTab = () => {
  const hasItems =
    visibleTrashedPrompts.length ||
    visibleTrashedLinks.length ||
    trashedScriptSummaries.length;

  const requestDelete = ({ category, item, permanent }) =>
    setPendingDelete({ category, item, permanent });

  const renderEntry = (entry, extra = null) => {
    const category = entry.category;
    const Icon =
      category === "prompts"
        ? FileText
        : category === "links"
        ? Link2
        : entry.type === "folder"
        ? Folder
        : FileText;
    const badgeColor =
      category === "prompts"
        ? "bg-[#1b4728] text-[#3fb950]"
        : category === "links"
        ? "bg-[#4b1d34] text-[#f778ba]"
        : entry.type === "folder"
        ? "bg-[#4d380a] text-[#f2cc60]"
        : "bg-[#0e305c] text-[#58a6ff]";
    const label = category.charAt(0).toUpperCase() + category.slice(1);

    return (
      <div
        key={entry.id}
        className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[#30363d] bg-[#0d1117] p-4"
      >
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${badgeColor}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold text-white">{entry.name}</p>
              <Badge className="bg-[#161b22] text-xs text-slate-200">{label}</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Deleted {formatDateTime(entry.deletedAt)} • {formatTrashTimeRemaining(entry.deletedAt)}
            </p>
            {entry.pathLabel && (
              <p className="mt-1 text-xs text-slate-400">Location: {entry.pathLabel}</p>
            )}
            {extra}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => handleRestore({ category, item: entry })}
            disabled={isBusy || !storageReady}
            className="bg-[#1f6feb] text-white hover:bg-[#388bfd] disabled:cursor-not-allowed disabled:bg-[#161b22] disabled:text-slate-500"
          >
            Backup
          </Button>
          <Button
            variant="outline"
            onClick={() => requestDelete({ category, item: entry, permanent: true })}
            disabled={isBusy || !storageReady}
            className="border-rose-500/40 bg-[#161b22] text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Delete
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="border-[#30363d] bg-[#0d1117] text-white">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-white">
            <Trash2 className="h-5 w-5 text-rose-300" /> Recently deleted
          </CardTitle>
          <p className="text-sm text-slate-400">
            Items stay in the bin for seven days. Restore them with Backup or remove them forever.
          </p>
        </CardHeader>
      </Card>

      {hasItems ? (
        <div className="space-y-3">
          {trashedScriptSummaries.map((summary) => {
            const { root, fileCount, folderCount } = summary;
            const extra = (
              <p className="mt-2 text-xs text-slate-400">
                {root.type === "folder"
                  ? `Contains ${folderCount} nested folder${folderCount === 1 ? "" : "s"} and ${fileCount} file${fileCount === 1 ? "" : "s"}.`
                  : `${fileCount} related file${fileCount === 1 ? "" : "s"} stored in this folder.`}
              </p>
            );
            return renderEntry(root, extra);
          })}
          {visibleTrashedPrompts.map((entry) => renderEntry(entry))}
          {visibleTrashedLinks.map((entry) => renderEntry(entry))}
        </div>
      ) : (
        <EmptyState
          icon={Trash2}
          title="Bin is empty"
          description="Deleted prompts, scripts, and links will appear here for seven days before they disappear."
        />
      )}
    </div>
  );
};

  const renderDashboard = () => {
    const tabDefinitions = [
      { id: "scripts", label: "Scripts", icon: Layers },
      { id: "prompts", label: "Prompts", icon: FileText },
      { id: "links", label: "Links", icon: Link2 },
      { id: "bin", label: "Bin", icon: Trash2 },
    ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Vault Dashboard</h1>
          <p className="mt-1 text-sm text-slate-300">Manage prompts, scripts, and research links in one secure workspace.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {currentUser && (
            <span className="rounded-full border border-[#30363d] bg-[#161b22] px-4 py-1 text-sm text-slate-200">
              Signed in as <span className="font-semibold text-white">{currentUser.name}</span>
            </span>
          )}
          <div
            ref={advancedSearchRef}
            className="relative flex flex-col items-stretch gap-2 sm:flex-row sm:items-center"
          >
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-2xl border border-[#30363d] bg-[#161b22] px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Search uploads"
                  className="w-48 bg-transparent text-sm text-white placeholder:text-[#8b949e] focus:outline-none"
                />
              </div>
              <Button
                type="submit"
                className="bg-[#238636] text-white hover:bg-[#2ea043]"
                disabled={!storageReady || workspaceLoading}
              >
                Search
              </Button>
            </form>
            <Button
              type="button"
              variant="outline"
              className="flex items-center gap-2 border-[#30363d] bg-[#161b22] text-white hover:bg-[#1b2330]"
              onClick={() => setAdvancedSearchOpen((prev) => !prev)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="text-sm">Advanced</span>
              <Badge className="bg-[#0b2f53] text-[10px] text-[#9cc4ff]">{searchScopeLabel}</Badge>
              <ChevronDown
                className={`h-4 w-4 transition ${advancedSearchOpen ? "rotate-180" : ""}`}
              />
            </Button>
            {advancedSearchOpen && (
              <div className="absolute right-0 top-full z-30 mt-3 w-80 rounded-2xl border border-[#30363d] bg-[#0d1117] p-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Advanced search</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-300 hover:bg-[#161b22]"
                    onClick={() => setAdvancedSearchOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Choose how you want to filter results before running a search.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className={`flex-1 border-[#30363d] ${
                      searchScope.type === "tab"
                        ? "bg-[#238636] text-white hover:bg-[#2ea043]"
                        : "bg-[#161b22] text-slate-200 hover:bg-[#1b2330]"
                    }`}
                    onClick={() =>
                      setSearchScope((prev) => ({
                        type: "tab",
                        target:
                          prev.type === "tab" && prev.target ? prev.target : "scripts",
                      }))
                    }
                  >
                    Tab wise
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={`flex-1 border-[#30363d] ${
                      searchScope.type === "user"
                        ? "bg-[#1f6feb] text-white hover:bg-[#388bfd]"
                        : "bg-[#161b22] text-slate-200 hover:bg-[#1b2330]"
                    }`}
                    onClick={() =>
                      setSearchScope((prev) => ({
                        type: "user",
                        target:
                          prev.type === "user" && prev.target
                            ? prev.target
                            : activeUserEmails[0] || null,
                      }))
                    }
                  >
                    User id wise
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 border-[#30363d] bg-[#0d1117] text-slate-200 hover:bg-[#161b22]"
                    onClick={() => setSearchScope({ type: "global", target: null })}
                  >
                    All tabs
                  </Button>
                </div>
                {searchScope.type === "tab" && (
                  <div className="mt-3 space-y-1">
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Choose tab
                    </label>
                    <select
                      value={searchScope.target || "scripts"}
                      onChange={(event) =>
                        setSearchScope({ type: "tab", target: event.target.value })
                      }
                      className="w-full rounded-xl border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-slate-100 focus:border-[#58a6ff] focus:outline-none"
                    >
                      <option value="scripts">Scripts</option>
                      <option value="prompts">Prompts</option>
                      <option value="links">Links</option>
                      <option value="bin">Bin</option>
                    </select>
                  </div>
                )}
                {searchScope.type === "user" && (
                  <div className="mt-3 space-y-1">
                    <label className="text-xs uppercase tracking-wide text-slate-400">
                      Choose user
                    </label>
                    {activeUserEmails.length ? (
                      <select
                        value={searchScope.target || activeUserEmails[0] || ""}
                        onChange={(event) =>
                          setSearchScope({
                            type: "user",
                            target: event.target.value || null,
                          })
                        }
                        className="w-full rounded-xl border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-slate-100 focus:border-[#58a6ff] focus:outline-none"
                      >
                        {activeUserEmails.map((email) => (
                          <option key={email} value={email}>
                            {email}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="rounded-xl border border-[#30363d] bg-[#161b22] px-3 py-2 text-xs text-rose-300">
                        No active user ids available yet.
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <span>Current scope: {searchScopeLabel}</span>
                  <Button variant="ghost" size="sm" onClick={clearSearch} className="h-8 px-3 text-slate-200">
                    Clear search
                  </Button>
                </div>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            className="border-[#30363d] bg-[#161b22] text-white hover:bg-[#1b2330]"
            onClick={() => setActiveView(activeView === "dashboard" ? "admin" : "dashboard")}
          >
            {activeView === "dashboard" ? "Admin panel" : "Back to dashboard"}
          </Button>
          <Button
            onClick={() => {
              setCurrentUser(null);
              setActiveView("dashboard");
            }}
            className="bg-[#bf3989] text-white hover:bg-[#f778ba]"
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <div key={category.id} className="rounded-2xl border border-[#30363d] bg-[#0d1117] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">{category.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{totals[category.id]}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#161b22] text-white">
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl border border-[#30363d] bg-[#0d1117] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#238636]/20 text-[#3fb950]">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Cloudflare R2 vault</h2>
              <p className="text-sm text-slate-400">Cloud storage keeps every upload backed up and shareable.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${connectionClasses}`}>
              <Cloud className={`h-4 w-4 ${storageReady ? "text-[#58a6ff]" : "text-current"}`} /> {connectionLabel}
            </span>
            {vaultStatus && <span className="text-xs text-slate-300">{vaultStatus}</span>}
            {vaultError && (
              <span className="rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs text-rose-100">
                {vaultError}
              </span>
            )}
            {searchFeedback && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
                {searchFeedback}
              </span>
            )}
            {searchSummary && (
              <span className="rounded-full border border-[#30363d] bg-[#161b22] px-3 py-1 text-xs text-slate-200">
                {searchSummary}
              </span>
            )}
            <Button
              onClick={handleBulkDownload}
              disabled={!selectedItems.length || isBusy || !storageReady}
              className="bg-[#238636] text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:bg-[#161b22] disabled:text-slate-500"
            >
              <Download className="mr-2 h-4 w-4" /> Download selection ({selectedItems.length})
            </Button>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-3">
            {tabDefinitions.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex min-w-[220px] flex-1 items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                    isActive
                      ? "border-[#58a6ff] bg-[#0d1624] shadow-[0_0_0_1px_rgba(88,166,255,0.4)]"
                      : "border-[#30363d] bg-[#161b22] hover:border-[#58a6ff]/40 hover:bg-[#1b2330]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
                        isActive
                          ? "bg-[#238636] text-white shadow-[0_0_0_1px_rgba(63,185,80,0.6)]"
                          : "bg-[#161b22] text-[#58a6ff]"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-semibold text-white">{tab.label}</p>
                  </div>
                  <Badge className="bg-[#161b22] text-xs text-slate-200">{totals[tab.id]}</Badge>
                </button>
              );
            })}
          </div>

          <div className="pt-2">
            {activeTab === "scripts" && renderScriptsTab()}
            {activeTab === "prompts" && renderPromptsTab()}
            {activeTab === "links" && renderLinksTab()}
            {activeTab === "bin" && renderBinTab()}
          </div>
        </div>
      </div>
    </div>
  );
};
  if (!currentUser) {
    return renderAuthScreen();
  }

  return (
    <div className="min-h-screen bg-[#010409] text-slate-100">
      {isDraftMode && (
        <div className="border-b border-amber-400/30 bg-amber-500/10 px-6 py-3 text-sm text-amber-200">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <span className="font-medium uppercase tracking-wide">Draft preview</span>
            <p className="text-amber-100/80">
              You are viewing VaultHub in draft mode. Use this session for internal reviews before publishing.
            </p>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-6xl space-y-10 px-6 py-10">
        {activeView === "admin" ? (adminOnly ? renderAdminPanel() : (
          <div className="space-y-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
            <p>You need administrator rights to manage access. Ask an admin to promote your account.</p>
            <div>
              <Button
                variant="outline"
                className="border-[#30363d] bg-[#161b22] text-white hover:bg-[#1b2330]"
                onClick={() => setActiveView("dashboard")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to dashboard
              </Button>
            </div>
          </div>
        )) : (
          renderDashboard()
        )}
      </div>
      {renderDeleteConfirm()}
      {renderContextMenu()}
      {renderLinkDownloadDialog()}
      {renderEditDrawer()}
    </div>
  );
}

