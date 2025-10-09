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

const resolveEnv = (value, fallback = "") =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

const SUPABASE_URL = resolveEnv(import.meta.env.VITE_SUPABASE_URL);
const SUPABASE_ANON_KEY = resolveEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);
const SUPABASE_REST_URL = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1` : "";

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
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase request failed (${response.status})`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
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

function ScriptBreadcrumb({ breadcrumbs, onNavigate }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm text-slate-300">
      {breadcrumbs.map((crumb, index) => (
        <React.Fragment key={crumb.id ?? "root"}>
          {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
          <button
            onClick={() => onNavigate(crumb.id)}
            className={`rounded-md px-2 py-1 transition ${
              crumb.active ? "bg-[#238636]/20 text-[#3fb950]" : "hover:bg-white/5"
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
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-300">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-white">
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

const mapPromptRow = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description ?? "",
  notes: row.notes ?? "",
  uploader: row.uploader ?? "Unknown",
  uploaderEmail: row.uploader_email ?? "",
  createdAt: row.created_at ?? new Date().toISOString(),
});

const mapLinkRow = (row) => ({
  id: row.id,
  name: row.name,
  url: row.url,
  notes: row.notes ?? "",
  uploader: row.uploader ?? "Unknown",
  uploaderEmail: row.uploader_email ?? "",
  createdAt: row.created_at ?? new Date().toISOString(),
});

const mapScriptRow = (row) => ({
  id: row.id,
  type: row.type,
  name: row.name,
  notes: row.notes ?? "",
  uploader: row.uploader ?? "Unknown",
  uploaderEmail: row.uploader_email ?? "",
  createdAt: row.created_at ?? new Date().toISOString(),
  parentId: row.parent_id ?? null,
  mimeType: row.file_mime ?? (row.type === "folder" ? "" : "application/octet-stream"),
  size: Number(row.file_size ?? 0),
  originalName: row.original_name ?? row.name,
  content: row.file_content ?? null,
});

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

export default function App() {
  const isDraftMode = import.meta.env.MODE === "draft";
  const supabaseReady = Boolean(SUPABASE_REST_URL);

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

  const [vaultError, setVaultError] = useState(() =>
    supabaseReady ? "" : "Supabase credentials are missing. Update your environment variables to enable cloud storage."
  );
  const [vaultStatus, setVaultStatus] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [currentScriptFolderId, setCurrentScriptFolderId] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [preview, setPreview] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

  const [scriptMode, setScriptMode] = useState("file");
  const [scriptFiles, setScriptFiles] = useState([]);
  const [scriptFolderFiles, setScriptFolderFiles] = useState([]);

  const folderInputRef = useRef(null);
  const contextMenuRef = useRef(null);

  useEffect(() => {
    if (scriptMode !== "folder") return;
    const node = folderInputRef.current;
    if (node) {
      node.setAttribute("webkitdirectory", "");
      node.setAttribute("directory", "");
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

  const refreshWorkspace = useCallback(async () => {
    if (!supabaseReady) {
      return;
    }
    try {
      setWorkspaceLoading(true);
      setVaultStatus("Syncing workspace from Supabase…");
      setVaultError("");

      const [promptsData, linksData, scriptsData] = await Promise.all([
        supabaseRequest("prompts?select=*"),
        supabaseRequest("links?select=*"),
        supabaseRequest("scripts?select=*"),
      ]);

      const promptEntries = (promptsData ?? []).map(mapPromptRow);
      const linkEntries = (linksData ?? []).map(mapLinkRow);
      const scriptEntries = (scriptsData ?? []).map(mapScriptRow);

      promptEntries.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      linkEntries.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      setPrompts(promptEntries);
      setLinks(linkEntries);
      setScripts(scriptEntries);
    } catch (error) {
      console.error("Failed to sync Supabase", error);
      setVaultError(error.message || "Unable to sync the Supabase workspace.");
    } finally {
      setWorkspaceLoading(false);
      setVaultStatus("");
    }
  }, [supabaseReady]);

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

  const scriptsInView = useMemo(
    () => scripts.filter((item) => item.parentId === (currentScriptFolderId ?? null)),
    [scripts, currentScriptFolderId]
  );

  const totals = useMemo(
    () => ({
      prompts: prompts.length,
      links: links.length,
      scripts: scripts.filter((item) => item.type === "file").length,
    }),
    [prompts, links, scripts]
  );

  const isBusy = isProcessing || workspaceLoading;
  const adminOnly = currentUser?.role === "admin";

  const handleAuth = (event) => {
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

    if (!allowedEmails.includes(email)) {
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
    if (!currentUser || !supabaseReady) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    if (!name) return;
    const createdAt = new Date().toISOString();
    try {
      setIsProcessing(true);
      const payload = {
        id: crypto.randomUUID(),
        name,
        description,
        notes,
        uploader: currentUser.name,
        uploader_email: currentUser.email,
        created_at: createdAt,
      };
      const data = await supabaseRequest("prompts", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([payload]),
      });
      const entry = mapPromptRow((data ?? [payload])[0]);
      setPrompts((prev) =>
        [...prev, entry].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      );
      event.currentTarget.reset();
    } catch (error) {
      console.error("Failed to add prompt", error);
      setVaultError(error.message || "Unable to save the prompt to Supabase.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddLink = async (event) => {
    event.preventDefault();
    if (!currentUser || !supabaseReady) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const url = String(form.get("url") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    if (!name || !url) return;
    const createdAt = new Date().toISOString();
    try {
      setIsProcessing(true);
      const payload = {
        id: crypto.randomUUID(),
        name,
        url,
        notes,
        uploader: currentUser.name,
        uploader_email: currentUser.email,
        created_at: createdAt,
      };
      const data = await supabaseRequest("links", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([payload]),
      });
      const entry = mapLinkRow((data ?? [payload])[0]);
      setLinks((prev) =>
        [...prev, entry].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      );
      event.currentTarget.reset();
    } catch (error) {
      console.error("Failed to add link", error);
      setVaultError(error.message || "Unable to save the link to Supabase.");
    } finally {
      setIsProcessing(false);
    }
  };

  const gatherFolderRows = async ({ files, name, notes, createdAt, parentLogicalId }) => {
    const rows = [];
    const rootId = crypto.randomUUID();
    const defaultRootName = files[0]?.webkitRelativePath?.split("/")[0] || "Folder";
    const rootRow = {
      id: rootId,
      type: "folder",
      name: name || defaultRootName,
      notes,
      uploader: currentUser.name,
      uploader_email: currentUser.email,
      created_at: createdAt,
      parent_id: parentLogicalId,
    };
    rows.push(rootRow);
    const pathToFolderId = new Map();
    pathToFolderId.set("", rootId);

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
            notes,
            uploader: currentUser.name,
            uploader_email: currentUser.email,
            created_at: createdAt,
            parent_id: folderParentId,
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
        notes,
        uploader: currentUser.name,
        uploader_email: currentUser.email,
        created_at: createdAt,
        parent_id: folderId,
        file_content: arrayBufferToBase64(buffer),
      });
    }

    return rows;
  };

  const handleAddScript = async (event) => {
    event.preventDefault();
    if (!currentUser || !supabaseReady) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    const createdAt = new Date().toISOString();
    const parentLogicalId = currentScriptFolderId ?? null;

    try {
      setIsProcessing(true);
      setVaultError("");

      if (scriptMode === "file") {
        if (!scriptFiles.length) return;
        const file = scriptFiles[0];
        const buffer = await file.arrayBuffer();
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
        };
        const data = await supabaseRequest("scripts", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify([payload]),
        });
        const entry = mapScriptRow((data ?? [payload])[0]);
        setScripts((prev) => [...prev, entry]);
        setScriptFiles([]);
        event.currentTarget.reset();
        return;
      }

      if (!scriptFolderFiles.length) return;
      const rows = await gatherFolderRows({
        files: Array.from(scriptFolderFiles),
        name,
        notes,
        createdAt,
        parentLogicalId,
      });
      const data = await supabaseRequest("scripts", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(rows),
      });
      const inserted = (data ?? rows).map(mapScriptRow);
      setScripts((prev) => [...prev, ...inserted]);
      setScriptFolderFiles([]);
      event.currentTarget.reset();
    } catch (error) {
      console.error("Failed to store scripts", error);
      setVaultError(error.message || "Unable to save the scripts to Supabase.");
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

  const collectScriptBranchIds = (rootId) => {
    const ids = new Set([rootId]);
    const queue = [rootId];
    while (queue.length) {
      const current = queue.shift();
      scripts.forEach((item) => {
        if (item.parentId === current && !ids.has(item.id)) {
          ids.add(item.id);
          queue.push(item.id);
        }
      });
    }
    return ids;
  };

  const pruneScriptItems = (ids) => {
    setScripts((prev) => prev.filter((item) => !ids.has(item.id)));
    setSelectedItems((prev) => prev.filter((item) => !(item.category === "scripts" && ids.has(item.id))));
    setPreview((prevPreview) => {
      if (prevPreview && prevPreview.category === "scripts" && ids.has(prevPreview.item.id)) {
        return null;
      }
      return prevPreview;
    });
    setCurrentScriptFolderId((currentId) => (currentId && ids.has(currentId) ? null : currentId));
  };

  const handleDelete = async (category, id) => {
    if (!supabaseReady) return;
    try {
      setIsProcessing(true);
      setVaultError("");
      if (category === "prompts") {
        await supabaseRequest(`prompts?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
        setPrompts((prev) => prev.filter((item) => item.id !== id));
        setSelectedItems((prev) => prev.filter((item) => !(item.category === category && item.id === id)));
        setPreview((prevPreview) =>
          prevPreview && prevPreview.category === category && prevPreview.item.id === id ? null : prevPreview
        );
        return;
      }
      if (category === "links") {
        await supabaseRequest(`links?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
        setLinks((prev) => prev.filter((item) => item.id !== id));
        setSelectedItems((prev) => prev.filter((item) => !(item.category === category && item.id === id)));
        setPreview((prevPreview) =>
          prevPreview && prevPreview.category === category && prevPreview.item.id === id ? null : prevPreview
        );
        return;
      }
      const ids = collectScriptBranchIds(id);
      const idList = Array.from(ids)
        .map((value) => `"${value}"`)
        .join(",");
      await supabaseRequest(`scripts?id=in.(${idList})`, { method: "DELETE" });
      pruneScriptItems(ids);
    } catch (error) {
      console.error("Failed to delete item", error);
      setVaultError(error.message || "Unable to delete the item from Supabase.");
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

  const handleDownload = async (category, item) => {
    try {
      setIsProcessing(true);
      if (category === "prompts") {
        const content = `Name: ${item.name}\nDescription: ${item.description || "-"}\nNotes: ${item.notes || "-"}\nUploaded by: ${item.uploader} (${item.uploaderEmail})`;
        downloadBlob(new Blob([content], { type: "text/plain" }), safeFileName(item.name, "txt"));
        return;
      }
      if (category === "links") {
        const content = `Name: ${item.name}\nURL: ${item.url}\nNotes: ${item.notes || "-"}\nUploaded by: ${item.uploader} (${item.uploaderEmail})`;
        downloadBlob(new Blob([content], { type: "text/plain" }), safeFileName(item.name, "txt"));
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
      setVaultError(error.message || "Unable to download the requested item.");
    } finally {
      setIsProcessing(false);
    }
  };

  const gatherSelectionEntries = useCallback(async () => {
    const entries = [];
    const added = new Set();

    const addEntry = (entry) => {
      if (added.has(entry.path)) return;
      added.add(entry.path);
      entries.push(entry);
    };

    for (const { category, id } of selectedItems) {
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
      setVaultError(error.message || "Unable to build the bulk download archive.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (!editingItem || !supabaseReady) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    if (!name) return;

    try {
      setIsProcessing(true);
      if (editingItem.category === "prompts") {
        const description = String(form.get("description") || "").trim();
        await supabaseRequest(`prompts?id=eq.${encodeURIComponent(editingItem.item.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ name, description, notes }),
        });
        setPrompts((prev) =>
          prev.map((entry) =>
            entry.id === editingItem.item.id ? { ...entry, name, description, notes } : entry
          )
        );
      } else if (editingItem.category === "links") {
        const url = String(form.get("url") || "").trim();
        await supabaseRequest(`links?id=eq.${encodeURIComponent(editingItem.item.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ name, url, notes }),
        });
        setLinks((prev) =>
          prev.map((entry) => (entry.id === editingItem.item.id ? { ...entry, name, url, notes } : entry))
        );
      } else if (editingItem.category === "scripts") {
        await supabaseRequest(`scripts?id=eq.${encodeURIComponent(editingItem.item.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ name, notes }),
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
    } catch (error) {
      console.error("Failed to update item", error);
      setVaultError(error.message || "Unable to update the item in Supabase.");
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
    return (
      <button
        key={item.id}
        onClick={() => setPreview({ category, item })}
        onContextMenu={(event) => handleContextMenu(event, category, item)}
        className={`group flex w-full items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-4 text-left transition hover:border-white/20 hover:bg-white/10 ${
          isSelected ? "border-[#1f6feb]/60 bg-[#1f6feb]/10" : ""
        }`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl ${
              category === "prompts"
                ? "bg-[#238636]/15 text-[#3fb950]"
                : category === "links"
                ? "bg-[#bf3989]/15 text-[#f778ba]"
                : item.type === "folder"
                ? "bg-[#d29922]/20 text-[#f2cc60]"
                : "bg-[#1f6feb]/15 text-[#58a6ff]"
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold text-white">{item.name}</p>
              {category === "scripts" && item.type === "folder" && (
                <Badge className="rounded-full bg-[#d29922]/20 text-xs text-[#f2cc60]">Folder</Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Uploaded by {item.uploader} • {formatDateTime(item.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={(event) => {
              event.stopPropagation();
              toggleSelection(category, item.id);
            }}
            className={`rounded-full border border-white/10 px-3 py-1 text-xs font-medium transition ${
              isSelected ? "bg-white/20 text-white" : "hover:bg-white/10 text-slate-300"
            }`}
          >
            {isSelected ? "Selected" : "Select"}
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:bg-white/10 hover:text-white"
            onClick={(event) => {
              event.stopPropagation();
              handleContextMenu(event, category, item);
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </button>
    );
  };

  const renderPreview = () => {
    if (!preview) {
      return (
        <Card className="border-white/10 bg-[#0d1117] text-white">
          <CardContent className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center text-slate-400">
            <Database className="h-10 w-10 text-slate-500" />
            <p className="max-w-xs text-sm">Select a prompt, script, or link to see its details here.</p>
          </CardContent>
        </Card>
      );
    }

    const { category, item } = preview;
    return (
      <Card className="border-white/10 bg-[#0d1117] text-white">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-white">{item.name}</CardTitle>
            <p className="mt-1 text-xs text-slate-400">
              Uploaded by {item.uploader} • {formatDateTime(item.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-white/10 text-xs text-slate-200">{category.toUpperCase()}</Badge>
            {category === "scripts" && item.type === "folder" && (
              <Badge className="bg-[#d29922]/20 text-xs text-[#f2cc60]">Folder</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {category === "prompts" && (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Description</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-white/5 bg-black/20 p-3 text-sm text-slate-100">
                  {item.description || "No description provided."}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Notes</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-white/5 bg-black/20 p-3 text-sm text-slate-100">
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
                  className="mt-1 inline-flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm text-[#58a6ff] hover:bg-white/5"
                >
                  {item.url}
                </a>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Notes</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-white/5 bg-black/20 p-3 text-sm text-slate-100">
                  {item.notes || "No notes yet."}
                </p>
              </div>
            </div>
          )}
          {category === "scripts" && (
            <div className="space-y-4">
              {item.type === "file" ? (
                <div className="rounded-lg border border-white/5 bg-black/20 p-4 text-sm text-slate-300">
                  <p className="font-semibold text-white">File details</p>
                  <p className="mt-2">Original name: {item.originalName || item.name}</p>
                  <p>Size: {item.size ? `${(item.size / 1024).toFixed(1)} KB` : "Unknown"}</p>
                  <p>Type: {item.mimeType}</p>
                </div>
              ) : (
                <div className="rounded-lg border border-white/5 bg-black/20 p-4 text-sm text-slate-300">
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
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-white/5 bg-black/20 p-3 text-sm text-slate-100">
                  {item.notes || "No notes yet."}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={async () => handleDownload(category, item)}
              disabled={isBusy}
              className="bg-[#1f6feb] text-white hover:bg-[#388bfd] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
            >
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditingItem({ category, item })}
              disabled={isBusy}
              className="border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"
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
                className="mt-2 border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
              />
            </div>
            {category === "prompts" && (
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Description</label>
                <Textarea
                  name="description"
                  defaultValue={item.description}
                  className="mt-2 min-h-[100px] border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
                />
              </div>
            )}
            {category === "links" && (
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">URL</label>
                <Input
                  name="url"
                  defaultValue={item.url}
                  className="mt-2 border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
                />
              </div>
            )}
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Notes</label>
              <Textarea
                name="notes"
                defaultValue={item.notes}
                className="mt-2 min-h-[120px] border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                onClick={() => setEditingItem(null)}
                variant="outline"
                className="border-white/10 bg-white/5 text-white hover:bg-white/10"
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
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
        >
          <Download className="h-4 w-4" /> Download
        </button>
        <button
          onClick={() => {
            setEditingItem({ category, item });
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
        >
          <PencilLine className="h-4 w-4" /> Edit
        </button>
        <button
          onClick={async () => {
            await handleDelete(category, item.id);
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-500/20"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
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
            <div className="flex rounded-full border border-white/10 bg-white/10 p-1 text-sm">
              <button
                onClick={() => {
                  setAuthView("login");
                  setAuthError("");
                }}
                className={`flex-1 rounded-full px-4 py-2 font-medium transition ${
                  authView === "login" ? "bg-[#238636] text-white" : "text-slate-200 hover:bg-white/10"
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
                  authView === "register" ? "bg-[#1f6feb] text-white" : "text-slate-200 hover:bg-white/10"
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
                    className="mt-1 border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
                  />
                </div>
              )}
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Email</label>
                <Input
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  className="mt-1 border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
                  required
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Password</label>
                <Input
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  className="mt-1 border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
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
        <Badge className="bg-[#238636]/20 text-[#3fb950]">
          <ShieldCheck className="mr-2 h-4 w-4" /> Administrator
        </Badge>
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
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const email = String(form.get("email") || "").trim().toLowerCase();
                if (!email || allowedEmails.includes(email)) return;
                setAllowedEmails((prev) => [...prev, email]);
                event.currentTarget.reset();
              }}
            >
              <Input
                name="email"
                type="email"
                placeholder="new.teammate@example.com"
                className="flex-1 border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
                required
              />
              <Button type="submit" className="bg-[#1f6feb] text-white hover:bg-[#388bfd]">
                Grant access
              </Button>
            </form>
            <div className="space-y-2">
              {allowedEmails.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm"
                >
                  <span className="text-slate-200">{email}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={protectedAdminEmails.has(email)}
                    className="text-rose-300 hover:bg-rose-500/20 hover:text-rose-100 disabled:cursor-not-allowed disabled:text-slate-500"
                    onClick={() => {
                      if (protectedAdminEmails.has(email)) return;
                      setAllowedEmails((prev) => prev.filter((entry) => entry !== email));
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
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3"
              >
                <div>
                  <p className="font-semibold text-white">{user.name}</p>
                  <p className="text-xs text-slate-400">{user.email}</p>
                </div>
                <Badge className={`rounded-full ${user.role === "admin" ? "bg-[#238636]/20 text-[#3fb950]" : "bg-white/10 text-slate-200"}`}>
                  {user.role === "admin" ? "Admin" : "Member"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Vault Dashboard</h1>
          <p className="mt-1 text-sm text-slate-300">
            Organise prompts, automation scripts, and research links with a familiar GitHub aesthetic.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {currentUser && (
            <span className="rounded-full border border-white/10 bg-white/10 px-4 py-1 text-sm text-slate-200">
              Signed in as <span className="font-semibold text-white">{currentUser.name}</span>
            </span>
          )}
          <Button
            variant="outline"
            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
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
            <div key={category.id} className={`rounded-2xl border border-white/5 bg-gradient-to-br ${category.accent} p-[1px]`}>
              <div className="rounded-[1.05rem] bg-[#0d1117] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">{category.label}</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{totals[category.id]}</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white">
                    <Icon className="h-6 w-6" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#0d1117] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#238636]/20 text-[#3fb950]">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Supabase vault</h2>
              <p className="text-sm text-slate-400">
                Files are stored in Supabase tables within your project&apos;s free tier database. Download or edit entries anytime.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              <Cloud className="h-4 w-4 text-[#58a6ff]" /> {supabaseReady ? "Connected to Supabase" : "Storage not configured"}
            </span>
            {vaultStatus && <span className="text-xs text-slate-300">{vaultStatus}</span>}
            {vaultError && (
              <span className="rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs text-rose-100">
                {vaultError}
              </span>
            )}
            <Button
              onClick={handleBulkDownload}
              disabled={!selectedItems.length || isBusy || !supabaseReady}
              className="bg-[#238636] text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
            >
              <Download className="mr-2 h-4 w-4" /> Bulk download ({selectedItems.length})
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <Card className="border-white/10 bg-[#0d1117]/60 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <UploadCloud className="h-5 w-5 text-[#58a6ff]" /> Add to your vault
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 text-sm text-slate-400">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-wide">
                    {scriptMode === "file" ? "Single upload" : "Folder upload"}
                  </span>
                  <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
                    <button
                      onClick={() => {
                        setScriptMode("file");
                        setScriptFolderFiles([]);
                      }}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        scriptMode === "file" ? "bg-[#1f6feb] text-white" : "text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      Script file
                    </button>
                    <button
                      onClick={() => {
                        setScriptMode("folder");
                        setScriptFiles([]);
                      }}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        scriptMode === "folder" ? "bg-[#238636] text-white" : "text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      Script folder
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-3">
                  <div className="space-y-4 lg:col-span-2">
                    <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
                      <h3 className="text-lg font-semibold text-white">Prompts</h3>
                      <p className="mt-1 text-sm text-slate-400">Store reusable prompt templates with context and reminders.</p>
                      <form onSubmit={handleAddPrompt} className="mt-4 space-y-3">
                        <Input
                          name="name"
                          placeholder="Prompt title"
                          className="border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
                          required
                        />
                        <Textarea
                          name="description"
                          placeholder="Short summary"
                          className="min-h-[80px] border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
                        />
                        <Textarea
                          name="notes"
                          placeholder="Paste the full prompt or any reminders"
                          className="min-h-[120px] border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
                        />
                        <Button
                          type="submit"
                          disabled={isBusy || !supabaseReady}
                          className="bg-[#238636] text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                        >
                          Save prompt
                        </Button>
                      </form>
                    </div>

                    <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
                      <h3 className="text-lg font-semibold text-white">Scripts</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Upload individual automation files or drag entire folders to mirror their structure.
                      </p>
                      <form onSubmit={handleAddScript} className="mt-4 space-y-4">
                        <Input
                          name="name"
                          placeholder={scriptMode === "file" ? "Display name" : "Folder name"}
                          className="border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
                        />
                        {scriptMode === "file" ? (
                          <Input
                            type="file"
                            onChange={(event) => setScriptFiles(Array.from(event.target.files || []))}
                            className="border border-white/10 bg-white/10 text-white file:mr-3 file:rounded-lg file:border-0 file:bg-[#1f6feb] file:px-4 file:py-2 file:text-sm file:text-white"
                            required
                          />
                        ) : (
                          <div className="space-y-2">
                            <Input
                              ref={folderInputRef}
                              type="file"
                              multiple
                              onChange={(event) => setScriptFolderFiles(Array.from(event.target.files || []))}
                              className="border border-white/10 bg-white/10 text-white file:mr-3 file:rounded-lg file:border-0 file:bg-[#1f6feb] file:px-4 file:py-2 file:text-sm file:text-white"
                              required
                            />
                            {scriptFolderFiles.length > 0 && (
                              <p className="text-xs text-slate-400">{scriptFolderFiles.length} items ready to upload</p>
                            )}
                          </div>
                        )}
                        <Textarea
                          name="notes"
                          placeholder="Context, setup steps, secrets, etc."
                          className="min-h-[120px] border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
                        />
                        <Button
                          type="submit"
                          disabled={isBusy || !supabaseReady}
                          className="bg-[#1f6feb] text-white hover:bg-[#388bfd] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                        >
                          Upload
                        </Button>
                      </form>
                    </div>

                    <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
                      <h3 className="text-lg font-semibold text-white">Links</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Save documentation, tutorials, and references with handy notes for collaborators.
                      </p>
                      <form onSubmit={handleAddLink} className="mt-4 space-y-3">
                        <Input
                          name="name"
                          placeholder="Resource name"
                          className="border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
                          required
                        />
                        <Input
                          name="url"
                          type="url"
                          placeholder="https://"
                          className="border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
                          required
                        />
                        <Textarea
                          name="notes"
                          placeholder="Why this link matters"
                          className="min-h-[120px] border border-white/10 bg-white/10 text-white placeholder:text-slate-300"
                        />
                        <Button
                          type="submit"
                          disabled={isBusy || !supabaseReady}
                          className="bg-[#bf3989] text-white hover:bg-[#f778ba] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                        >
                          Save link
                        </Button>
                      </form>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
                      <h3 className="text-lg font-semibold text-white">Prompts</h3>
                      <div className="mt-3 space-y-2">
                        {prompts.length ? (
                          prompts
                            .slice()
                            .reverse()
                            .map((prompt) => renderListItem("prompts", prompt))
                        ) : (
                          <EmptyState
                            icon={FileText}
                            title="No prompts yet"
                            description="Upload your go-to prompt templates to access them quickly across projects."
                          />
                        )}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
                      <h3 className="text-lg font-semibold text-white">Links</h3>
                      <div className="mt-3 space-y-2">
                        {links.length ? (
                          links
                            .slice()
                            .reverse()
                            .map((link) => renderListItem("links", link))
                        ) : (
                          <EmptyState
                            icon={Link2}
                            title="No links saved"
                            description="Collect tutorials, documentation, and reference URLs so your whole team stays aligned."
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-white/10 bg-white/5 text-white">
              <CardHeader>
                <CardTitle className="text-white">Scripts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScriptBreadcrumb breadcrumbs={scriptBreadcrumbs} onNavigate={setCurrentScriptFolderId} />
                <div className="space-y-3">
                  {scriptsInView.length ? (
                    scriptsInView.map((script) => renderListItem("scripts", script))
                  ) : (
                    <EmptyState
                      icon={Folder}
                      title="This folder is empty"
                      description="Drag in a folder or upload a script file to start building your automation library."
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            {renderPreview()}
          </div>
        </div>
      </div>
    </div>
  );

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
      {renderContextMenu()}
      {renderEditDrawer()}
    </div>
  );
}

