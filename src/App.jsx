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

const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_SUPABASE_PROJECT_REF = "cauostpphtbzfyejffhk";
const DEFAULT_SUPABASE_URL = `https://${DEFAULT_SUPABASE_PROJECT_REF}.supabase.co`;
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhdW9zdHBwaHRiemZ5ZWpmZmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5NjAyMjQsImV4cCI6MjA3NTUzNjIyNH0.JTucDx5zwBf2tk8LndLumLXInKc5BFDhvjxO9fZd7kI";

const resolveEnv = (value, fallback = "") =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

const normaliseSupabaseUrl = (value, fallback = "") => {
  const trimmed = resolveEnv(value, fallback);
  if (!trimmed) {
    return "";
  }
  const sanitized = trimmed.replace(/\/$/, "");
  const dashboardMatch = sanitized.match(/supabase\.com\/dashboard\/project\/([a-z0-9-]+)/i);
  if (dashboardMatch) {
    return `https://${dashboardMatch[1]}.supabase.co`;
  }
  if (/^[a-z0-9-]+$/i.test(sanitized) && !sanitized.includes(".")) {
    return `https://${sanitized}.supabase.co`;
  }
  return sanitized;
};

const SUPABASE_URL = normaliseSupabaseUrl(
  import.meta.env.VITE_SUPABASE_URL,
  DEFAULT_SUPABASE_URL
);
const SUPABASE_ANON_KEY = resolveEnv(
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_KEY,
  DEFAULT_SUPABASE_ANON_KEY
);
const SUPABASE_REST_URL = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1`
  : "";

function parseSupabaseErrorPayload(payload) {
  if (!payload) return null;
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload);
      return parseSupabaseErrorPayload(parsed) ?? { message: payload };
    } catch (error) {
      return { message: payload };
    }
  }
  if (typeof payload === "object") {
    const { message, code, details, hint } = payload;
    return {
      message: typeof message === "string" ? message : "",
      code: typeof code === "string" ? code : undefined,
      details: typeof details === "string" ? details : undefined,
      hint: typeof hint === "string" ? hint : undefined,
    };
  }
  return null;
}

async function supabaseRequest(path, { method = "GET", headers = {}, body, signal } = {}) {
  if (!SUPABASE_REST_URL) {
    throw new Error("Supabase credentials are not configured.");
  }
  const hasBody = body !== undefined;
  const response = await fetch(`${SUPABASE_REST_URL}/${path}`, {
    method,
    signal,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body,
  });
  const contentType = response.headers.get("Content-Type") || "";
  const rawText = await response.text();

  if (!response.ok) {
    const parsed = parseSupabaseErrorPayload(rawText);
    const error = new Error(
      parsed?.message || rawText || `Supabase request failed (${response.status})`
    );
    if (parsed?.code) {
      error.code = parsed.code;
    }
    if (parsed?.details) {
      error.details = parsed.details;
    }
    if (parsed?.hint) {
      error.hint = parsed.hint;
    }
    error.status = response.status;
    throw error;
  }

  if (!rawText || !rawText.trim()) {
    return null;
  }

  if (/application\/json/i.test(contentType)) {
    try {
      return JSON.parse(rawText);
    } catch (error) {
      console.warn("Failed to parse Supabase JSON response", error);
      return null;
    }
  }

  return rawText;
}

const textEncoder = new TextEncoder();

function arrayBufferToBase64(buffer) {
  if (typeof window === "undefined" && typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    return window.btoa(binary);
  }
  if (typeof globalThis !== "undefined" && typeof globalThis.btoa === "function") {
    return globalThis.btoa(binary);
  }
  throw new Error("Base64 encoding is not supported in this environment.");
}

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

const defaultSupabaseSchema = {
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
};

const optionalColumns = {
  allowed_emails: new Set(["role", "created_at"]),
  prompts: new Set(["description", "notes", "deleted_at"]),
  links: new Set(["notes", "deleted_at"]),
  scripts: new Set([
    "notes",
    "original_name",
    "parent_id",
    "file_mime",
    "file_size",
    "file_content",
    "deleted_at",
  ]),
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

function parseMissingColumnError(error) {
  if (!error || !error.message) {
    return null;
  }
  const message = String(error.message);
  const match = message.match(/could not find the '([^']+)' column of '([^']+)'/i);
  if (match) {
    return { column: match[1], table: match[2] };
  }
  return null;
}

function resolveMissingColumn(schema, tableKeyHint, info) {
  if (!info) return null;
  const normalizedColumn = String(info.column || "").toLowerCase();
  const normalizedTable = String(info.table || "")
    .toLowerCase()
    .replace(/^public\./, "");

  const candidateKeys = [];
  if (tableKeyHint) {
    candidateKeys.push(tableKeyHint);
  }
  for (const [key, config] of Object.entries(schema)) {
    if (candidateKeys.includes(key)) continue;
    const tableName = String(config.table || key).toLowerCase();
    if (!normalizedTable || tableName === normalizedTable || key.toLowerCase() === normalizedTable) {
      candidateKeys.push(key);
    }
  }

  for (const key of candidateKeys) {
    const config = schema[key];
    if (!config) continue;
    for (const [logicalKey, columnName] of Object.entries(config.columns)) {
      if (!columnName) continue;
      if (columnName.toLowerCase() !== normalizedColumn) continue;
      if (!optionalColumns[key]?.has(logicalKey)) {
        return null;
      }
      const updated = cloneSchema(schema);
      updated[key] = {
        ...updated[key],
        columns: {
          ...updated[key].columns,
          [logicalKey]: null,
        },
      };
      return {
        schema: updated,
        tableKey: key,
        logicalKey,
        columnName,
      };
    }
  }

  return null;
}

const shapeSupabasePayload = (tableSchema, canonical) => {
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

const mapPromptRow = (row, columns = defaultSupabaseSchema.prompts.columns) => ({
  id: getColumnName(row, columns.id),
  name: getColumnName(row, columns.name),
  description: getColumnName(row, columns.description) ?? "",
  notes: getColumnName(row, columns.notes) ?? "",
  uploader: getColumnName(row, columns.uploader) ?? "Unknown",
  uploaderEmail: getColumnName(row, columns.uploader_email) ?? "",
  createdAt: getColumnName(row, columns.created_at) ?? new Date().toISOString(),
  deletedAt: getColumnName(row, columns.deleted_at) ?? null,
});

const mapLinkRow = (row, columns = defaultSupabaseSchema.links.columns) => ({
  id: getColumnName(row, columns.id),
  name: getColumnName(row, columns.name),
  url: getColumnName(row, columns.url),
  notes: getColumnName(row, columns.notes) ?? "",
  uploader: getColumnName(row, columns.uploader) ?? "Unknown",
  uploaderEmail: getColumnName(row, columns.uploader_email) ?? "",
  createdAt: getColumnName(row, columns.created_at) ?? new Date().toISOString(),
  deletedAt: getColumnName(row, columns.deleted_at) ?? null,
});

const mapScriptRow = (row, columns = defaultSupabaseSchema.scripts.columns) => ({
  id: getColumnName(row, columns.id),
  type: getColumnName(row, columns.type),
  name: getColumnName(row, columns.name),
  notes: getColumnName(row, columns.notes) ?? "",
  uploader: getColumnName(row, columns.uploader) ?? "Unknown",
  uploaderEmail: getColumnName(row, columns.uploader_email) ?? "",
  createdAt: getColumnName(row, columns.created_at) ?? new Date().toISOString(),
  parentId: getColumnName(row, columns.parent_id) ?? null,
  mimeType:
    getColumnName(row, columns.file_mime) ??
    (getColumnName(row, columns.type) === "folder" ? "" : "application/octet-stream"),
  size: Number(getColumnName(row, columns.file_size) ?? 0),
  originalName: getColumnName(row, columns.original_name) ?? getColumnName(row, columns.name),
  content: getColumnName(row, columns.file_content) ?? null,
  deletedAt: getColumnName(row, columns.deleted_at) ?? null,
});

const buildSupabaseSchemaMapping = (rows = []) => {
  const byTable = new Map();
  for (const entry of rows) {
    const tableName = String(entry.table_name || "").toLowerCase();
    const columnName = String(entry.column_name || "");
    if (!tableName || !columnName) continue;
    if (!byTable.has(tableName)) {
      byTable.set(tableName, []);
    }
    byTable.get(tableName).push(columnName);
  }

  const mapping = {};
  const missing = [];

  for (const [table, config] of Object.entries(defaultSupabaseSchema)) {
    const availableColumns = new Map();
    for (const columnName of byTable.get(table) ?? []) {
      availableColumns.set(columnName.toLowerCase(), columnName);
    }

    const resolvedColumns = {};
    for (const [logicalKey, defaultColumn] of Object.entries(config.columns)) {
      const synonyms = [defaultColumn, ...(columnSynonyms[logicalKey] ?? [])];
      let resolved = null;
      for (const synonym of synonyms) {
        const candidate = availableColumns.get(synonym.toLowerCase());
        if (candidate) {
          resolved = candidate;
          break;
        }
      }

      if (!resolved) {
        const isOptional = optionalColumns[table]?.has(logicalKey);
        if (!isOptional) {
          missing.push({ table, column: defaultColumn });
          resolvedColumns[logicalKey] = defaultColumn;
        } else {
          resolvedColumns[logicalKey] = null;
        }
      } else {
        resolvedColumns[logicalKey] = resolved;
      }
    }

    mapping[table] = {
      ...config,
      columns: resolvedColumns,
    };
  }

  return { mapping, missing };
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

const SUPABASE_POLICY_GUIDE =
  "Supabase blocked this action because row-level security is still enabled. Run the policy script from the README (see the Supabase policies section) inside your project's SQL editor and refresh VaultHub.";

function formatRowLevelSecurityMessage(error) {
  const tableMatch = error?.message?.match(/table \"([^\"]+)\"/i);
  const tableSuffix = tableMatch ? ` for the "${tableMatch[1]}" table` : "";
  const hint = error?.hint ? ` Hint: ${error.hint}` : "";
  return `${SUPABASE_POLICY_GUIDE.replace(
    "this action",
    `this action${tableSuffix}`
  )}${hint}`;
}

function formatSupabaseErrorMessage(error, fallback) {
  if (!error) {
    return fallback;
  }

  const message = typeof error.message === "string" ? error.message : "";
  if (error.code === "42501" || /row-level security/i.test(message)) {
    return formatRowLevelSecurityMessage(error);
  }
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
  const supabaseReady = Boolean(SUPABASE_REST_URL && SUPABASE_ANON_KEY);

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

  const [supabaseSchema, setSupabaseSchema] = useState(() => cloneSchema(defaultSupabaseSchema));

  const [vaultError, setVaultError] = useState(() =>
    supabaseReady ? "" : "Supabase credentials are missing. Update your environment variables to enable cloud storage."
  );
  const [vaultStatus, setVaultStatus] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [missingSchemaColumns, setMissingSchemaColumns] = useState([]);

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

  const [activeTab, setActiveTab] = useState("scripts");

  const [scriptMode, setScriptMode] = useState("file");
  const [scriptFiles, setScriptFiles] = useState([]);
  const [scriptFolderFiles, setScriptFolderFiles] = useState([]);

  const folderInputRef = useRef(null);
  const contextMenuRef = useRef(null);

  const storageReady = supabaseReady;
  const describeSupabaseError = useCallback(
    (error, fallback) => formatSupabaseErrorMessage(error, fallback),
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
      if (!supabaseReady || !supabaseSchema.allowed_emails?.columns?.email) {
        return false;
      }
      try {
        const column = supabaseSchema.allowed_emails.columns.email;
        const table = supabaseSchema.allowed_emails.table;
        const response = await supabaseRequest(
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
        console.warn("Failed to verify Supabase allowlist", error);
      }
      return false;
    },
    [allowedEmails, supabaseReady, supabaseSchema]
  );
  const connectionLabel = useMemo(() => {
    if (!supabaseReady) return "Storage not configured";
    if (vaultError) return "Supabase issue";
    if (workspaceLoading) return "Syncing Supabase…";
    return "Connected to Supabase";
  }, [supabaseReady, vaultError, workspaceLoading]);
  const connectionClasses = useMemo(() => {
    if (!supabaseReady) {
      return "border-white/10 bg-[#161b22] text-slate-300";
    }
    if (vaultError) {
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    }
    return "border-[#58a6ff]/40 bg-[#0b2f53] text-[#9cc4ff]";
  }, [supabaseReady, vaultError]);

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

  const executeSupabase = useCallback(
    async (tableKey, action) => {
      let schema = supabaseSchema;
      let lastError = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          return await action(schema);
        } catch (error) {
          lastError = error;
          const info = parseMissingColumnError(error);
          const resolved = resolveMissingColumn(schema, tableKey, info);
          if (!resolved) {
            throw error;
          }
          schema = resolved.schema;
          setSupabaseSchema(resolved.schema);
          setMissingSchemaColumns((prev) => {
            const key = `${resolved.tableKey}:${resolved.logicalKey}`;
            if (prev.some((entry) => entry.key === key)) {
              return prev;
            }
            const tableLabel = resolved.tableKey.charAt(0).toUpperCase() + resolved.tableKey.slice(1);
            const columnLabel =
              resolved.logicalKey === resolved.columnName
                ? resolved.columnName
                : `${resolved.logicalKey} (${resolved.columnName})`;
            return [
              ...prev,
              {
                key,
                table: tableLabel,
                column: columnLabel,
              },
            ];
          });
          continue;
        }
      }
      throw lastError;
    },
    [supabaseSchema, setSupabaseSchema, setMissingSchemaColumns]
  );

  const schemaWarningText = useMemo(() => {
    if (!missingSchemaColumns.length) return "";
    return missingSchemaColumns
      .map((entry) => `${entry.table}: ${entry.column}`)
      .join(" • ");
  }, [missingSchemaColumns]);

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
        await executeSupabase(tableKey, async (schema) => {
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
            await supabaseRequest(
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
    [executeSupabase, storageReady]
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
    if (!supabaseReady) {
      return;
    }
    try {
      setWorkspaceLoading(true);
      setVaultStatus("Syncing workspace from Supabase…");
      setVaultError("");

      const [allowedEmailRows, promptsData, linksData, scriptsData] = await Promise.all([
        supabaseSchema.allowed_emails.columns.email
          ? supabaseRequest(`${supabaseSchema.allowed_emails.table}?select=*`)
          : Promise.resolve(null),
        supabaseRequest(`${supabaseSchema.prompts.table}?select=*`),
        supabaseRequest(`${supabaseSchema.links.table}?select=*`),
        supabaseRequest(`${supabaseSchema.scripts.table}?select=*`),
      ]);

      if (Array.isArray(allowedEmailRows)) {
        const emailColumn = supabaseSchema.allowed_emails.columns.email;
        const fetched = allowedEmailRows
          .map((row) => String(getColumnName(row, emailColumn) || "").trim().toLowerCase())
          .filter(Boolean);
        const missingDefaults = initialAllowedEmails.filter(
          (email) => !fetched.includes(email)
        );
        if (missingDefaults.length) {
          try {
            await executeSupabase("allowed_emails", async (schema) => {
              const seedRows = missingDefaults.map((email) =>
                shapeSupabasePayload(schema.allowed_emails, {
                  email,
                  role: protectedAdminEmails.has(email) ? "admin" : "member",
                  created_at: new Date().toISOString(),
                })
              );
              if (!seedRows.length) return;
              await supabaseRequest(schema.allowed_emails.table, {
                method: "POST",
                headers: { Prefer: "resolution=ignore-duplicates" },
                body: JSON.stringify(seedRows),
              });
            });
            fetched.push(...missingDefaults);
          } catch (error) {
            console.warn("Failed to seed default allowed emails", error);
            setVaultError(
              describeSupabaseError(
                error,
                "Unable to seed the default admin allowlist in Supabase."
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
        mapPromptRow(row, supabaseSchema.prompts.columns)
      );
      const linkEntries = (linksData ?? []).map((row) =>
        mapLinkRow(row, supabaseSchema.links.columns)
      );
      const scriptEntries = (scriptsData ?? []).map((row) =>
        mapScriptRow(row, supabaseSchema.scripts.columns)
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
      console.error("Failed to sync Supabase", error);
      setVaultError(
        describeSupabaseError(error, "Unable to sync the Supabase workspace.")
      );
    } finally {
      setWorkspaceLoading(false);
      setVaultStatus("");
    }
  }, [supabaseReady, supabaseSchema, executeSupabase, partitionTrashEntries, cleanupExpiredTrash, describeSupabaseError]);

  useEffect(() => {
    if (!supabaseReady) {
      return;
    }
    refreshWorkspace();
  }, [supabaseReady, refreshWorkspace]);

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

  const trashedScriptsById = useMemo(() => {
    const map = new Map();
    trashedScripts.forEach((item) => map.set(item.id, item));
    return map;
  }, [trashedScripts]);

  const trashedScriptRoots = useMemo(() => {
    const trashedIds = new Set(trashedScripts.map((item) => item.id));
    return trashedScripts.filter(
      (item) => !item.parentId || !trashedIds.has(item.parentId)
    );
  }, [trashedScripts]);

  const trashedScriptSummaries = useMemo(() => {
    const summaries = trashedScriptRoots.map((root) => {
      const ids = collectScriptBranchIds(root.id, trashedScripts);
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
      return { root, ids, fileCount, folderCount };
    });
    return summaries.sort(
      (a, b) => new Date(b.root.deletedAt || 0) - new Date(a.root.deletedAt || 0)
    );
  }, [trashedScriptRoots, trashedScripts, trashedScriptsById, collectScriptBranchIds]);

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
    const filter = uploaderFilters.prompts;
    if (!filter) {
      return prompts;
    }
    return prompts.filter(
      (entry) => String(entry.uploaderEmail || "").toLowerCase() === filter
    );
  }, [prompts, uploaderFilters.prompts]);

  const filteredLinks = useMemo(() => {
    const filter = uploaderFilters.links;
    if (!filter) {
      return links;
    }
    return links.filter(
      (entry) => String(entry.uploaderEmail || "").toLowerCase() === filter
    );
  }, [links, uploaderFilters.links]);

  const scriptsInView = useMemo(() => {
    const base = scripts.filter((item) => item.parentId === (currentScriptFolderId ?? null));
    const filter = uploaderFilters.scripts;
    if (!filter) {
      return base;
    }
    return base.filter(
      (entry) => String(entry.uploaderEmail || "").toLowerCase() === filter
    );
  }, [scripts, currentScriptFolderId, uploaderFilters.scripts]);

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

  const handleAddPrompt = async (event) => {
    event.preventDefault();
    if (!currentUser || !storageReady) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    if (!name) return;
    const createdAt = new Date().toISOString();
    let progressId = null;
    try {
      setIsProcessing(true);
      setVaultError("");
      progressId = beginUploadProgress("prompts", "Saving prompt…");
      updateUploadProgress("prompts", progressId, { value: 15 });
      const payload = {
        id: crypto.randomUUID(),
        name,
        description,
        notes,
        uploader: currentUser.name,
        uploader_email: currentUser.email,
        created_at: createdAt,
        deleted_at: null,
      };
      const entry = await executeSupabase("prompts", async (schema) => {
        const shapedPayload = shapeSupabasePayload(schema.prompts, payload);
        updateUploadProgress("prompts", progressId, {
          label: "Uploading to Supabase…",
          value: 45,
        });
        const data = await supabaseRequest(schema.prompts.table, {
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
    } catch (error) {
      console.error("Failed to add prompt", error);
      if (progressId) {
        failUploadProgress("prompts", progressId, "Prompt upload failed");
      }
      setVaultError(
        describeSupabaseError(error, "Unable to save the prompt to Supabase.")
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
    if (!name || !url) return;
    const createdAt = new Date().toISOString();
    let progressId = null;
    try {
      setIsProcessing(true);
      setVaultError("");
      progressId = beginUploadProgress("links", "Saving link…");
      updateUploadProgress("links", progressId, { value: 15 });
      const payload = {
        id: crypto.randomUUID(),
        name,
        url,
        notes,
        uploader: currentUser.name,
        uploader_email: currentUser.email,
        created_at: createdAt,
        deleted_at: null,
      };
      const entry = await executeSupabase("links", async (schema) => {
        const shapedPayload = shapeSupabasePayload(schema.links, payload);
        updateUploadProgress("links", progressId, {
          label: "Uploading to Supabase…",
          value: 45,
        });
        const data = await supabaseRequest(schema.links.table, {
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
    } catch (error) {
      console.error("Failed to add link", error);
      if (progressId) {
        failUploadProgress("links", progressId, "Link upload failed");
      }
      setVaultError(
        describeSupabaseError(error, "Unable to save the link to Supabase.")
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
  }) => {
    const rows = [];
    const rootId = crypto.randomUUID();
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
          });
          pathToFolderId.set(currentPath, folderId);
        }
      }
      const parentPathKey = parts.join("/");
      const folderId = parentPathKey ? pathToFolderId.get(parentPathKey) : rootId;
      const buffer = await file.arrayBuffer();
      rows.push({
        id: crypto.randomUUID(),
        type: "file",
        name: fileName,
        original_name: file.name,
        file_mime: file.type || "application/octet-stream",
        file_size: Number(file.size || 0),
        file_content: arrayBufferToBase64(buffer),
        notes,
        uploader: currentUser.name,
        uploader_email: currentUser.email,
        created_at: createdAt,
        parent_id: folderId,
        deleted_at: null,
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
    const createdAt = new Date().toISOString();
    const parentLogicalId = currentScriptFolderId ?? null;
    let progressId = null;

    try {
      setIsProcessing(true);
      setVaultError("");

      if (scriptMode === "file") {
        if (!scriptFiles.length) return;
        const file = scriptFiles[0];
        progressId = beginUploadProgress("scripts", "Preparing script file…");
        updateUploadProgress("scripts", progressId, { value: 12 });
        const buffer = await file.arrayBuffer();
        updateUploadProgress("scripts", progressId, {
          label: "Encoding file…",
          value: 32,
        });
        const payload = {
          id: crypto.randomUUID(),
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
          file_content: arrayBufferToBase64(buffer),
          deleted_at: null,
        };
        const entry = await executeSupabase("scripts", async (schema) => {
          const shapedPayload = shapeSupabasePayload(schema.scripts, payload);
          updateUploadProgress("scripts", progressId, {
            label: "Uploading to Supabase…",
            value: 55,
          });
          const data = await supabaseRequest(schema.scripts.table, {
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
        return;
      }

      if (!scriptFolderFiles.length) return;
      progressId = beginUploadProgress("scripts", "Preparing folder upload…");
      updateUploadProgress("scripts", progressId, { value: 12 });
      const rows = await gatherFolderRows({
        files: Array.from(scriptFolderFiles),
        name,
        notes,
        createdAt,
        parentLogicalId,
        onProgress: ({ processedBytes, totalBytes, fileName }) => {
          if (!progressId) return;
          const portion = totalBytes ? processedBytes / totalBytes : 1;
          const value = 12 + portion * 50;
          updateUploadProgress("scripts", progressId, {
            value,
            label: fileName ? `Encoding ${fileName}` : "Preparing folder…",
          });
        },
      });
      const inserted = await executeSupabase("scripts", async (schema) => {
        const shapedRows = rows.map((row) => shapeSupabasePayload(schema.scripts, row));
        updateUploadProgress("scripts", progressId, {
          label: "Uploading to Supabase…",
          value: 75,
        });
        const data = await supabaseRequest(schema.scripts.table, {
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
    } catch (error) {
      console.error("Failed to store scripts", error);
      if (progressId) {
        failUploadProgress("scripts", progressId, "Script upload failed");
      }
      setVaultError(
        describeSupabaseError(error, "Unable to save the scripts to Supabase.")
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
        await executeSupabase("prompts", async (schema) => {
          const path = buildInFilterPath(schema.prompts, "id", Array.from(ids));
          if (permanent) {
            await supabaseRequest(path, { method: "DELETE" });
            return;
          }
          const payload = shapeSupabasePayload(schema.prompts, { deleted_at: deletedAt });
          await supabaseRequest(path, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
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
        await executeSupabase("links", async (schema) => {
          const path = buildInFilterPath(schema.links, "id", Array.from(ids));
          if (permanent) {
            await supabaseRequest(path, { method: "DELETE" });
            return;
          }
          const payload = shapeSupabasePayload(schema.links, { deleted_at: deletedAt });
          await supabaseRequest(path, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
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
          await executeSupabase("scripts", async (schema) => {
            const filter = buildInFilterPath(schema.scripts, "id", idValues);
            if (permanent) {
              await supabaseRequest(filter, { method: "DELETE" });
            } else {
              const payload = shapeSupabasePayload(schema.scripts, { deleted_at: deletedAt });
              await supabaseRequest(filter, {
                method: "PATCH",
                body: JSON.stringify(payload),
              });
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
        describeSupabaseError(error, "Unable to delete the item from Supabase.")
      );
    } finally {
      setIsProcessing(false);
      if (completed) {
        setPendingDelete(null);
      }
    }
  };

  const handleRestore = async ({ category, item }) => {
    if (!storageReady || !item) return;
    try {
      setIsProcessing(true);
      setVaultError("");

      if (category === "prompts") {
        await executeSupabase("prompts", async (schema) => {
          const payload = shapeSupabasePayload(schema.prompts, { deleted_at: null });
          await supabaseRequest(buildFilterPath(schema.prompts, "id", item.id), {
            method: "PATCH",
            body: JSON.stringify(payload),
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
        await executeSupabase("links", async (schema) => {
          const payload = shapeSupabasePayload(schema.links, { deleted_at: null });
          await supabaseRequest(buildFilterPath(schema.links, "id", item.id), {
            method: "PATCH",
            body: JSON.stringify(payload),
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
        const idColumn = supabaseSchema.scripts.columns.id ?? "id";
        const idList = Array.from(ids)
          .map((value) => `"${value}"`)
          .join(",");
        const encodedValues = encodeURIComponent(`(${idList})`);
        await executeSupabase("scripts", async (schema) => {
          const payload = shapeSupabasePayload(schema.scripts, { deleted_at: null });
          await supabaseRequest(
            `${schema.scripts.table}?${encodeURIComponent(idColumn)}=in.${encodedValues}`,
            {
              method: "PATCH",
              body: JSON.stringify(payload),
            }
          );
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
    } catch (error) {
      console.error("Failed to restore item", error);
      setVaultError(
        describeSupabaseError(error, "Unable to restore the item in Supabase.")
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
    async (item, prefixSegments = []) => {
      const entries = [];
      const pathSegments = [...prefixSegments, item.name];
      if (item.type === "folder") {
        entries.push({
          path: `${pathSegments.join("/")}/`,
          data: new Uint8Array(0),
          crc: 0,
          isDirectory: true,
          date: new Date(item.createdAt),
          externalAttr: 0x10 << 16,
        });
        const children = scripts.filter((child) => child.parentId === item.id);
        for (const child of children) {
          const childEntries = await gatherScriptEntries(child, pathSegments);
          entries.push(...childEntries);
        }
        return entries;
      }
      const buffer = base64ToUint8Array(item.content);
      entries.push({
        path: pathSegments.join("/"),
        data: buffer,
        crc: crc32(buffer),
        date: new Date(item.createdAt),
      });
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
        return;
      }
      if (category === "links") {
        const chosen = LINK_EXPORT_FORMATS.find((entry) => entry.ext === options.format) ?? LINK_EXPORT_FORMATS[0];
        const content = `Name: ${item.name}\nURL: ${item.url}\nNotes: ${item.notes || "-"}\nUploaded by: ${item.uploader} (${item.uploaderEmail})`;
        const blob = new Blob([content], { type: chosen.mime || "text/plain" });
        downloadBlob(blob, safeFileName(item.name, chosen.ext));
        return;
      }
      if (item.type === "file") {
        const buffer = base64ToUint8Array(item.content);
        const blob = new Blob([buffer], { type: item.mimeType || "application/octet-stream" });
        downloadBlob(blob, item.name);
        return;
      }
      const entries = await gatherScriptEntries(item);
      const zip = createZip(entries);
      downloadBlob(zip, `${safeFileName(item.name)}.zip`);
    } catch (error) {
      console.error("Failed to download item", error);
      setVaultError(
        describeSupabaseError(error, "Unable to download the requested item.")
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
        continue;
      }
      const script = scriptsById.get(id);
      if (!script) continue;
      if (script.type === "file") {
        const buffer = base64ToUint8Array(script.content);
        addEntry({
          path: ["Scripts", ...scriptPath(script)].join("/"),
          data: buffer,
          crc: crc32(buffer),
          date: new Date(script.createdAt),
        });
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
        describeSupabaseError(error, "Unable to build the bulk download archive.")
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
        describeSupabaseError(error, "Unable to build the bulk download archive.")
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
        await executeSupabase("prompts", async (schema) => {
          const updatePayload = shapeSupabasePayload(schema.prompts, {
            name,
            description,
            notes,
          });
          await supabaseRequest(buildFilterPath(schema.prompts, "id", editingItem.item.id), {
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
        await executeSupabase("links", async (schema) => {
          const updatePayload = shapeSupabasePayload(schema.links, {
            name,
            url,
            notes,
          });
          await supabaseRequest(buildFilterPath(schema.links, "id", editingItem.item.id), {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(updatePayload),
          });
        });
        setLinks((prev) =>
          prev.map((entry) => (entry.id === editingItem.item.id ? { ...entry, name, url, notes } : entry))
        );
      } else if (editingItem.category === "scripts") {
        await executeSupabase("scripts", async (schema) => {
          const updatePayload = shapeSupabasePayload(schema.scripts, {
            name,
            notes,
          });
          await supabaseRequest(buildFilterPath(schema.scripts, "id", editingItem.item.id), {
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
    } catch (error) {
      console.error("Failed to update item", error);
      setVaultError(
        describeSupabaseError(error, "Unable to update the item in Supabase.")
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
                  await executeSupabase("allowed_emails", async (schema) => {
                    const payload = shapeSupabasePayload(schema.allowed_emails, {
                      email,
                      role: "member",
                      created_at: new Date().toISOString(),
                    });
                    await supabaseRequest(schema.allowed_emails.table, {
                      method: "POST",
                      headers: { Prefer: "resolution=ignore-duplicates" },
                      body: JSON.stringify([payload]),
                    });
                  });
                  setAllowedEmails((prev) =>
                    Array.from(new Set([...prev, email])).sort((a, b) => a.localeCompare(b))
                  );
                  formElement?.reset();
                } catch (error) {
                  console.error("Failed to store allowed email", error);
                  setVaultError(
                    describeSupabaseError(
                      error,
                      "Unable to save the approved email in Supabase."
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
                        await supabaseRequest(
                          buildFilterPath(supabaseSchema.allowed_emails, "email", email),
                          { method: "DELETE" }
                        );
                        setAllowedEmails((prev) => prev.filter((entry) => entry !== email));
                      } catch (error) {
                        console.error("Failed to remove allowed email", error);
                        setVaultError(
                          describeSupabaseError(
                            error,
                            "Unable to remove the approved email from Supabase."
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
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <Card className="border-[#30363d] bg-[#0d1117] text-white">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-white">
              <UploadCloud className="h-5 w-5 text-[#58a6ff]" /> Upload scripts
            </CardTitle>
            <p className="text-sm text-slate-400">
              Add single automation files or mirror entire folders. Notes stay attached for fast hand-offs.
            </p>
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
                <p className="text-sm text-slate-400">Navigate folders and manage uploaded automation assets.</p>
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
                    title={
                      uploaderFilters.scripts ? "No scripts for this teammate" : "This folder is empty"
                    }
                    description={
                      uploaderFilters.scripts
                        ? "Select another teammate or clear the filter to explore all available scripts."
                        : "Upload a file or folder to populate this space."
                    }
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
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <Card className="border-[#30363d] bg-[#0d1117] text-white">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-white">
            <FileText className="h-5 w-5 text-[#3fb950]" /> Save a prompt
          </CardTitle>
          <p className="text-sm text-slate-400">Capture your favourite templates with descriptions and execution notes.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddPrompt} className="space-y-4">
            <Input name="name" placeholder="Prompt title" required className="bg-[#161b22]" />
            <Textarea
              name="description"
              placeholder="Short summary"
              className="min-h-[100px] bg-[#161b22]"
            />
            <Textarea
              name="notes"
              placeholder="Full prompt or reminders"
              className="min-h-[160px] bg-[#161b22]"
            />
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
              <p className="text-sm text-slate-400">Right-click any prompt to edit, download, or remove it.</p>
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
                title={uploaderFilters.prompts ? "No prompts for this teammate" : "No prompts yet"}
                description={
                  uploaderFilters.prompts
                    ? "Choose another uploader or clear the filter to browse all prompts."
                    : "Add your first prompt to keep it handy for future sessions."
                }
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
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <Card className="border-[#30363d] bg-[#0d1117] text-white">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-white">
            <Link2 className="h-5 w-5 text-[#f778ba]" /> Save a link
          </CardTitle>
          <p className="text-sm text-slate-400">Collect references, tutorials, and documentation with helpful context.</p>
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
              <p className="text-sm text-slate-400">Download entries in the format you need straight from the context menu.</p>
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
                title={uploaderFilters.links ? "No links for this teammate" : "No links saved"}
                description={
                  uploaderFilters.links
                    ? "Select a different uploader or clear the filter to view all saved links."
                    : "Keep your go-to resources a click away by adding them here."
                }
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
    trashedPrompts.length || trashedLinks.length || trashedScriptSummaries.length;

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
          {trashedPrompts.map((entry) => renderEntry(entry))}
          {trashedLinks.map((entry) => renderEntry(entry))}
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
      { id: "scripts", label: "Scripts", icon: Layers, description: "Automation files and folders" },
      { id: "prompts", label: "Prompts", icon: FileText, description: "Reusable writing templates" },
      { id: "links", label: "Links", icon: Link2, description: "Reference URLs and notes" },
      { id: "bin", label: "Bin", icon: Trash2, description: "Recover or remove deleted items" },
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
              <h2 className="text-xl font-semibold text-white">Supabase vault</h2>
              <p className="text-sm text-slate-400">Cloud storage keeps every upload backed up and shareable.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${connectionClasses}`}>
              <Cloud className={`h-4 w-4 ${storageReady ? "text-[#58a6ff]" : "text-current"}`} /> {connectionLabel}
            </span>
            {vaultStatus && <span className="text-xs text-slate-300">{vaultStatus}</span>}
            {schemaWarningText && (
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-100">
                {schemaWarningText}
              </span>
            )}
            {vaultError && (
              <span className="rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs text-rose-100">
                {vaultError}
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
                  onClick={() => setActiveTab(tab.id)}
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
                    <div>
                      <p className="text-sm font-semibold text-white">{tab.label}</p>
                      <p className="text-xs text-slate-400">{tab.description}</p>
                    </div>
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
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
            You need administrator rights to manage access. Ask an admin to promote your account.
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

