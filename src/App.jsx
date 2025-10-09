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
  HardDrive,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Badge } from "./components/ui/badge";

const initialAllowedEmails = ["admin@vaulthub.dev", "rajhanoch24@gmail.com"];
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
  initialUsers.filter((user) => user.role === "admin").map((user) => user.email)
);

const categories = [
  { id: "prompts", label: "Prompts", icon: FileText, accent: "from-[#238636] to-[#2ea043]" },
  { id: "scripts", label: "Scripts", icon: Layers, accent: "from-[#1f6feb] to-[#388bfd]" },
  { id: "links", label: "Links", icon: Link2, accent: "from-[#bf3989] to-[#f778ba]" },
];

const DEFAULT_GOOGLE_CLIENT_ID =
  "952287910237-kqtdm3ls26n054t3eoelmi901filbmj0.apps.googleusercontent.com";
const DEFAULT_GOOGLE_API_KEY = "AIzaSyALZ-76IMlrMHlRv0oNurLBfmM_mK_R9Ac";

const resolveEnv = (value, fallback) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

const GOOGLE_API_KEY = resolveEnv(import.meta.env.VITE_GOOGLE_API_KEY, DEFAULT_GOOGLE_API_KEY);
const GOOGLE_CLIENT_ID = resolveEnv(import.meta.env.VITE_GOOGLE_CLIENT_ID, DEFAULT_GOOGLE_CLIENT_ID);
const DRIVE_SCOPES =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly";
const DRIVE_FOLDER_NAME = "VaultHub Workspace";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const WORKSPACE_VERSION = "2";

const textEncoder = new TextEncoder();

const DEFAULT_DRIVE_ERROR_MESSAGE = "Something went wrong while talking to Google Drive.";

function normaliseDriveError(error) {
  if (!error) {
    return { message: DEFAULT_DRIVE_ERROR_MESSAGE };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  const gapiError = error?.result?.error;
  const errorMessage =
    error?.message ||
    error?.error_description ||
    gapiError?.message ||
    DEFAULT_DRIVE_ERROR_MESSAGE;

  const reason =
    gapiError?.errors?.[0]?.reason ||
    gapiError?.reason ||
    error?.reason ||
    (typeof error?.error === "string" ? error.error : undefined);
  const status = gapiError?.status || error?.status;
  const code = gapiError?.code || error?.code;

  const combinedText = [
    errorMessage,
    error?.error_description,
    gapiError?.message,
    error?.details,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let hint = "";
  if (
    reason === "insufficientPermissions" ||
    reason === "forbidden" ||
    status === "PERMISSION_DENIED" ||
    combinedText.includes("insufficient permission") ||
    combinedText.includes("insufficient permissions")
  ) {
    hint =
      "Enable the Google Drive API for this OAuth client and add the signed-in account as a test user on the consent screen.";
  } else if (
    reason === "accessNotConfigured" ||
    combinedText.includes("has not been used in project")
  ) {
    hint = "Turn on the Google Drive API for this project in Google Cloud console, then try again.";
  } else if (reason === "invalid" || combinedText.includes("invalid value")) {
    hint =
      "Google rejected one of the Drive folders the workspace references. Click “Refresh Drive” to let VaultHub rebuild its Drive structure, or delete the existing “VaultHub Workspace” folder in Drive before reconnecting.";
  } else if (combinedText.includes("invalid grant")) {
    hint =
      "The Drive token expired or was revoked. Click \"Connect Google Drive\" again or remove VaultHub from https://myaccount.google.com/permissions before retrying.";
  } else if (
    reason === "dailyLimitExceeded" ||
    reason === "userRateLimitExceeded" ||
    reason === "rateLimitExceeded"
  ) {
    hint = "Google is currently throttling Drive requests. Wait a moment and retry the sync.";
  }

  const detailCandidates = [
    error?.error_description,
    gapiError?.message,
    error?.details,
  ];
  const detail = detailCandidates.find(
    (value) => Boolean(value) && value !== errorMessage
  );

  return {
    message: errorMessage,
    detail: detail || "",
    hint,
    code,
    status,
    reason,
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
            className={`rounded-md px-2 py-1 transition ${crumb.active ? "bg-[#238636]/20 text-[#3fb950]" : "hover:bg-white/5"}`}
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

export default function App() {
  const isDraftMode = import.meta.env.MODE === "draft";
  const [allowedEmails, setAllowedEmails] = useState(initialAllowedEmails);
  const [users, setUsers] = useState(initialUsers);
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState("login");
  const [authError, setAuthError] = useState("");

  const missingDriveCredentials = !GOOGLE_API_KEY || !GOOGLE_CLIENT_ID;
  const [driveClientReady, setDriveClientReady] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState("");
  const [driveErrorInfo, setDriveErrorInfo] = useState(null);
  const [driveBootstrapMessage, setDriveBootstrapMessage] = useState("");
  const [driveFolders, setDriveFolders] = useState(null);
  const [driveProfile, setDriveProfile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [activeTab, setActiveTab] = useState("prompts");
  const [activeView, setActiveView] = useState("dashboard");

  const [prompts, setPrompts] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [links, setLinks] = useState([]);

  const [currentScriptFolderId, setCurrentScriptFolderId] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [preview, setPreview] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

  const [scriptMode, setScriptMode] = useState("file");
  const [scriptFiles, setScriptFiles] = useState([]);
  const [scriptFolderFiles, setScriptFolderFiles] = useState([]);

  const folderInputRef = useRef(null);
  const tokenClientRef = useRef(null);
  const driveFoldersRef = useRef(null);

  const loadScript = useCallback((src) => {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.body.appendChild(script);
    });
  }, []);

  const clearDriveError = useCallback(() => {
    setDriveError("");
    setDriveErrorInfo(null);
  }, []);

  const handleDriveError = useCallback((error) => {
    console.error(error);
    const info = normaliseDriveError(error);
    setDriveError(info.message);
    setDriveErrorInfo(info);
  }, []);

  useEffect(() => {
    if (scriptMode === "file") {
      setScriptFolderFiles([]);
    } else {
      setScriptFiles([]);
    }
  }, [scriptMode]);

  useEffect(() => {
    if (activeView !== "dashboard" || !currentUser) {
      return;
    }

    let cancelled = false;
    const initialise = async () => {
      if (missingDriveCredentials) {
        setDriveClientReady(false);
        setDriveConnected(false);
        setDriveFolders(null);
        setDriveBootstrapMessage("");
        handleDriveError(
          "Add VITE_GOOGLE_API_KEY and VITE_GOOGLE_CLIENT_ID to connect Google Drive storage."
        );
        return;
      }
      try {
        clearDriveError();
        setDriveBootstrapMessage(
          "Loading Google authentication libraries… The first load can take up to 10 seconds while Google initialises."
        );
        await loadScript("https://accounts.google.com/gsi/client");
        if (cancelled) return;
        setDriveBootstrapMessage("Loading Google Drive client…");
        await loadScript("https://apis.google.com/js/api.js");
        if (cancelled) return;
        setDriveBootstrapMessage("Initialising Google Drive SDK…");
        await new Promise((resolve) => {
          window.gapi.load("client", resolve);
        });
        if (cancelled) return;
        await window.gapi.client.init({
          apiKey: GOOGLE_API_KEY,
          discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
        });
        if (cancelled) return;
        await window.gapi.client.load("drive", "v3");
        if (cancelled) return;
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: DRIVE_SCOPES,
          callback: () => {},
        });
        setDriveClientReady(true);
        setDriveBootstrapMessage("");
      } catch (error) {
        if (!cancelled) {
          setDriveBootstrapMessage("");
          handleDriveError(error);
        }
      }
    };

    initialise();

    return () => {
      cancelled = true;
    };
  }, [
    activeView,
    clearDriveError,
    currentUser,
    handleDriveError,
    loadScript,
    missingDriveCredentials,
  ]);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("directory", "");
    }
  }, []);

  useEffect(() => {
    const listener = () => setContextMenu(null);
    window.addEventListener("click", listener);
    window.addEventListener("contextmenu", listener);
    return () => {
      window.removeEventListener("click", listener);
      window.removeEventListener("contextmenu", listener);
    };
  }, []);

  const requestDriveAccess = useCallback(
    (promptForConsent = false) => {
      if (!driveClientReady || !tokenClientRef.current) {
        return Promise.reject(new Error("Google Drive isn't ready yet."));
      }
      return new Promise((resolve, reject) => {
        tokenClientRef.current.callback = (response) => {
          if (response.error) {
            reject(new Error(response.error_description || "Google Drive authorization was denied."));
            return;
          }
          const accessToken = response.access_token;
          window.gapi.client.setToken({ access_token: accessToken });
          setDriveConnected(true);
          resolve(accessToken);
        };
        tokenClientRef.current.error_callback = (error) => {
          const code = error?.error || "authorization_error";
          const description = error?.error_description || "Google Drive authorization failed.";
          if (code === "redirect_uri_mismatch") {
            const origin = window.location?.origin ?? "your site";
            reject(
              new Error(
                `Google rejected the Drive request because the OAuth client hasn't been told about ${origin}.\n\n` +
                  `Open the Google Cloud console for the client ID ${GOOGLE_CLIENT_ID}, edit the OAuth 2.0 Web credentials, and add ${origin} to **Authorized JavaScript origins**. ` +
                  "If you're testing from a deploy preview, add that preview URL as well. Save the change, wait a few seconds, then try again."
              )
            );
            return;
          }
          reject(new Error(description));
        };
        try {
          tokenClientRef.current.requestAccessToken({ prompt: promptForConsent ? "consent" : "" });
        } catch (error) {
          reject(error);
        }
      });
    },
    [driveClientReady]
  );

  const ensureDriveToken = useCallback(async () => {
    const token = window.gapi?.client?.getToken?.();
    if (token?.access_token) {
      return token.access_token;
    }
    return requestDriveAccess(false);
  }, [requestDriveAccess]);

  const driveApiFetch = useCallback(
    async (url, options = {}) => {
      const accessToken = await ensureDriveToken();
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {}),
      };
      const response = await fetch(url, { ...options, headers });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `Google Drive request failed (${response.status})`);
      }
      return response;
    },
    [ensureDriveToken]
  );

  const findFolderByProperty = useCallback(
    async (key, value) => {
      await ensureDriveToken();
      const query = [
        "trashed=false",
        `mimeType='${FOLDER_MIME_TYPE}'`,
        `appProperties has { key='${key}', value='${value}' }`,
      ].join(" and ");
      const response = await window.gapi.client.drive.files.list({
        q: query,
        fields: "files(id,name,appProperties,parents)",
        pageSize: 10,
        orderBy: "createdTime desc",
      });
      const files = response.result.files || [];
      for (const file of files) {
        try {
          await window.gapi.client.drive.files.get({ fileId: file.id, fields: "id" });
          return file;
        } catch (error) {
          const info = normaliseDriveError(error);
          const message = (info.message || "").toLowerCase();
          if (
            info.reason === "invalid" ||
            info.code === 400 ||
            info.status === "INVALID_ARGUMENT" ||
            info.code === 404 ||
            message.includes("invalid value")
          ) {
            continue;
          }
          throw error;
        }
      }
      return null;
    },
    [ensureDriveToken]
  );

  const createDriveFolder = useCallback(
    async (name, parentId, appProperties = {}) => {
      await ensureDriveToken();
      const response = await window.gapi.client.drive.files.create({
        resource: {
          name,
          mimeType: FOLDER_MIME_TYPE,
          parents: parentId ? [parentId] : undefined,
          appProperties: { vaultHub: "true", ...appProperties },
        },
        fields: "id,name,appProperties,parents,createdTime,description",
      });
      return response.result;
    },
    [ensureDriveToken]
  );

  const ensureWorkspaceStructure = useCallback(async () => {
    const buildWorkspace = async (forceNewRoot = false) => {
      let root = null;
      if (!forceNewRoot) {
        root =
          (await findFolderByProperty("vaultHubWorkspaceVersion", WORKSPACE_VERSION)) ||
          (await findFolderByProperty("vaultHubRoot", "true"));
      }
      if (root && root.appProperties?.vaultHubWorkspaceVersion !== WORKSPACE_VERSION) {
        try {
          await window.gapi.client.drive.files.update({
            fileId: root.id,
            resource: {
              appProperties: {
                ...(root.appProperties || {}),
                vaultHub: "true",
                vaultHubRoot: "true",
                vaultHubWorkspaceVersion: WORKSPACE_VERSION,
              },
            },
            fields: "id,appProperties",
          });
          root.appProperties = {
            ...(root.appProperties || {}),
            vaultHub: "true",
            vaultHubRoot: "true",
            vaultHubWorkspaceVersion: WORKSPACE_VERSION,
          };
        } catch (error) {
          const info = normaliseDriveError(error);
          const message = (info.message || "").toLowerCase();
          if (
            info.reason === "invalid" ||
            info.code === 400 ||
            info.status === "INVALID_ARGUMENT" ||
            info.code === 404 ||
            message.includes("invalid value")
          ) {
            root = null;
          } else {
            throw error;
          }
        }
      }
      if (!root) {
        root = await createDriveFolder(DRIVE_FOLDER_NAME, null, {
          vaultHub: "true",
          vaultHubRoot: "true",
          vaultHubWorkspaceVersion: WORKSPACE_VERSION,
        });
      }

      const ensureCategoryFolder = async (category, defaultName) => {
        const query = [
          "trashed=false",
          `mimeType='${FOLDER_MIME_TYPE}'`,
          `appProperties has { key='vaultHubCategory', value='${category}' }`,
          `'${root.id}' in parents`,
        ].join(" and ");
        const response = await window.gapi.client.drive.files.list({
          q: query,
          fields: "files(id,name,appProperties,parents)",
          pageSize: 1,
        });
        let folder = response.result.files?.[0];
        if (!folder) {
          folder = await createDriveFolder(defaultName, root.id, {
            vaultHub: "true",
            vaultHubCategory: category,
            vaultHubWorkspaceVersion: WORKSPACE_VERSION,
          });
        } else if (folder.appProperties?.vaultHubWorkspaceVersion !== WORKSPACE_VERSION) {
          try {
            await window.gapi.client.drive.files.update({
              fileId: folder.id,
              resource: {
                appProperties: {
                  ...(folder.appProperties || {}),
                  vaultHub: "true",
                  vaultHubCategory: category,
                  vaultHubWorkspaceVersion: WORKSPACE_VERSION,
                },
              },
              fields: "id,appProperties",
            });
            folder.appProperties = {
              ...(folder.appProperties || {}),
              vaultHub: "true",
              vaultHubCategory: category,
              vaultHubWorkspaceVersion: WORKSPACE_VERSION,
            };
          } catch (error) {
            const info = normaliseDriveError(error);
            const message = (info.message || "").toLowerCase();
            if (
              info.reason === "invalid" ||
              info.code === 400 ||
              info.status === "INVALID_ARGUMENT" ||
              info.code === 404 ||
              message.includes("invalid value")
            ) {
              folder = await createDriveFolder(defaultName, root.id, {
                vaultHub: "true",
                vaultHubCategory: category,
                vaultHubWorkspaceVersion: WORKSPACE_VERSION,
              });
            } else {
              throw error;
            }
          }
        }
        return folder;
      };

      const promptsFolder = await ensureCategoryFolder("prompts", "Prompts");
      const scriptsFolder = await ensureCategoryFolder("scripts", "Scripts");
      const linksFolder = await ensureCategoryFolder("links", "Links");

      const folders = {
        rootId: root.id,
        promptsId: promptsFolder.id,
        scriptsId: scriptsFolder.id,
        linksId: linksFolder.id,
      };

      driveFoldersRef.current = folders;
      setDriveFolders(folders);
      return folders;
    };

    try {
      return await buildWorkspace(false);
    } catch (error) {
      const info = normaliseDriveError(error);
      const message = (info.message || "").toLowerCase();
      if (
        info.reason === "invalid" ||
        info.code === 400 ||
        info.status === "INVALID_ARGUMENT" ||
        message.includes("invalid value")
      ) {
        return await buildWorkspace(true);
      }
      throw error;
    }
  }, [createDriveFolder, findFolderByProperty]);

  const listFolderContents = useCallback(
    async (folderId) => {
      await ensureDriveToken();
      const items = [];
      let pageToken = undefined;
      do {
        const response = await window.gapi.client.drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          fields:
            "nextPageToken,files(id,name,mimeType,description,appProperties,createdTime,modifiedTime,size,parents,owners(displayName,emailAddress))",
          pageSize: 1000,
          pageToken,
        });
        const files = response.result.files || [];
        items.push(...files);
        pageToken = response.result.nextPageToken;
      } while (pageToken);
      return items;
    },
    [ensureDriveToken]
  );

  const fetchDriveProfile = useCallback(async () => {
    await ensureDriveToken();
    const response = await window.gapi.client.drive.about.get({
      fields: "user(displayName,emailAddress)",
    });
    return response.result.user;
  }, [ensureDriveToken]);

  const loadPromptsFromDrive = useCallback(
    async (folderId) => {
      if (!folderId) return [];
      const files = await listFolderContents(folderId);
      const entries = [];
      for (const file of files) {
        try {
          const response = await driveApiFetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`
          );
          const text = await response.text();
          const data = JSON.parse(text);
          entries.push({
            id: file.id,
            name: data.name || file.name.replace(/\.json$/i, ""),
            description: data.description || "",
            notes: data.notes || file.description || "",
            uploader: data.uploader || file.appProperties?.uploaderName || file.owners?.[0]?.displayName || "Unknown",
            uploaderEmail:
              data.uploaderEmail || file.appProperties?.uploaderEmail || file.owners?.[0]?.emailAddress || "",
            createdAt: data.createdAt || file.appProperties?.createdAt || file.createdTime,
            fileId: file.id,
          });
        } catch (error) {
          console.warn("Failed to read prompt", file.id, error);
        }
      }
      entries.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setPrompts(entries);
      return entries;
    },
    [driveApiFetch, listFolderContents]
  );

  const loadLinksFromDrive = useCallback(
    async (folderId) => {
      if (!folderId) return [];
      const files = await listFolderContents(folderId);
      const entries = [];
      for (const file of files) {
        try {
          const response = await driveApiFetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`
          );
          const text = await response.text();
          const data = JSON.parse(text);
          entries.push({
            id: file.id,
            name: data.name || file.name.replace(/\.json$/i, ""),
            url: data.url || "",
            notes: data.notes || file.description || "",
            uploader: data.uploader || file.appProperties?.uploaderName || file.owners?.[0]?.displayName || "Unknown",
            uploaderEmail:
              data.uploaderEmail || file.appProperties?.uploaderEmail || file.owners?.[0]?.emailAddress || "",
            createdAt: data.createdAt || file.appProperties?.createdAt || file.createdTime,
            fileId: file.id,
          });
        } catch (error) {
          console.warn("Failed to read link", file.id, error);
        }
      }
      entries.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setLinks(entries);
      return entries;
    },
    [driveApiFetch, listFolderContents]
  );

  const loadScriptsFromDrive = useCallback(
    async (folderId, logicalParentId = null, collection = []) => {
      if (!folderId) return collection;
      const files = await listFolderContents(folderId);
      for (const file of files) {
        const base = {
          id: file.id,
          name: file.name,
          notes: file.description || "",
          uploader: file.appProperties?.uploaderName || file.owners?.[0]?.displayName || "Unknown",
          uploaderEmail: file.appProperties?.uploaderEmail || file.owners?.[0]?.emailAddress || "",
          createdAt: file.appProperties?.createdAt || file.createdTime,
          parentId: logicalParentId,
        };
        if (file.mimeType === FOLDER_MIME_TYPE) {
          const folderItem = {
            ...base,
            type: "folder",
          };
          collection.push(folderItem);
          await loadScriptsFromDrive(file.id, file.id, collection);
        } else {
          const fileItem = {
            ...base,
            type: "file",
            mimeType: file.mimeType,
            size: Number(file.size || 0),
            originalName: file.appProperties?.originalName || file.name,
          };
          collection.push(fileItem);
        }
      }
      return collection;
    },
    [listFolderContents]
  );

  const refreshWorkspace = useCallback(async () => {
    try {
      setDriveLoading(true);
      setDriveBootstrapMessage("Syncing your Google Drive workspace…");
      const folders = driveFoldersRef.current || (await ensureWorkspaceStructure());
      await Promise.all([
        loadPromptsFromDrive(folders.promptsId),
        loadLinksFromDrive(folders.linksId),
        (async () => {
          const entries = await loadScriptsFromDrive(folders.scriptsId, null, []);
          setScripts(entries);
        })(),
      ]);
      clearDriveError();
      if (!driveProfile) {
        const profile = await fetchDriveProfile();
        setDriveProfile(profile);
      }
    } catch (error) {
      handleDriveError(error);
    } finally {
      setDriveLoading(false);
      setDriveBootstrapMessage("");
    }
  }, [
    clearDriveError,
    ensureWorkspaceStructure,
    fetchDriveProfile,
    handleDriveError,
    loadLinksFromDrive,
    loadPromptsFromDrive,
    loadScriptsFromDrive,
    driveProfile,
  ]);

  const handleDriveConnect = useCallback(async () => {
    try {
      clearDriveError();
      setDriveLoading(true);
      setDriveBootstrapMessage("Authorising with Google Drive…");
      await requestDriveAccess(true);
      await refreshWorkspace();
    } catch (error) {
      handleDriveError(error);
    } finally {
      setDriveLoading(false);
      setDriveBootstrapMessage("");
    }
  }, [clearDriveError, handleDriveError, refreshWorkspace, requestDriveAccess]);

  useEffect(() => {
    if (!driveClientReady || missingDriveCredentials) return;
    const token = window.gapi?.client?.getToken?.();
    if (token?.access_token && !driveConnected) {
      setDriveConnected(true);
      refreshWorkspace();
    }
  }, [driveClientReady, driveConnected, missingDriveCredentials, refreshWorkspace]);

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

  const driveReadyForActions = driveConnected && Boolean(driveFolders);
  const isBusy = isProcessing || driveLoading;

  const handleAuth = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim().toLowerCase();
    const password = String(form.get("password"));
    const name = String(form.get("name") || "").trim();

    if (authView === "login") {
      const user = users.find((u) => u.email === email && u.password === password);
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
    if (users.some((u) => u.email === email)) {
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
    if (!currentUser) return;
    if (!driveFolders?.promptsId) {
      handleDriveError("Connect Google Drive before saving prompts.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    if (!name) return;
    const createdAt = new Date().toISOString();
    const payload = {
      name,
      description,
      notes,
      uploader: currentUser.name,
      uploaderEmail: currentUser.email,
      createdAt,
    };
    try {
      setIsProcessing(true);
      await ensureDriveToken();
      const response = await window.gapi.client.drive.files.create({
        resource: {
          name: safeFileName(name, "json"),
          parents: [driveFolders.promptsId],
          description: notes,
          appProperties: {
            vaultHub: "true",
            uploaderName: currentUser.name,
            uploaderEmail: currentUser.email,
            createdAt,
          },
        },
        media: {
          mimeType: "application/json",
          body: new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
        },
        fields: "id",
      });
      const entry = { ...payload, id: response.result.id, fileId: response.result.id };
      setPrompts((prev) =>
        [...prev, entry].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      );
      event.currentTarget.reset();
    } catch (error) {
      handleDriveError(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddLink = async (event) => {
    event.preventDefault();
    if (!currentUser) return;
    if (!driveFolders?.linksId) {
      handleDriveError("Connect Google Drive before saving links.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const url = String(form.get("url") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    if (!name || !url) return;
    const createdAt = new Date().toISOString();
    const payload = {
      name,
      url,
      notes,
      uploader: currentUser.name,
      uploaderEmail: currentUser.email,
      createdAt,
    };
    try {
      setIsProcessing(true);
      await ensureDriveToken();
      const response = await window.gapi.client.drive.files.create({
        resource: {
          name: safeFileName(name, "json"),
          parents: [driveFolders.linksId],
          description: notes,
          appProperties: {
            vaultHub: "true",
            uploaderName: currentUser.name,
            uploaderEmail: currentUser.email,
            createdAt,
          },
        },
        media: {
          mimeType: "application/json",
          body: new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
        },
        fields: "id",
      });
      const entry = { ...payload, id: response.result.id, fileId: response.result.id };
      setLinks((prev) =>
        [...prev, entry].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      );
      event.currentTarget.reset();
    } catch (error) {
      handleDriveError(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddScript = async (event) => {
    event.preventDefault();
    if (!currentUser) return;
    if (!driveFolders?.scriptsId) {
      handleDriveError("Connect Google Drive before uploading scripts.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const notes = String(formData.get("notes") || "").trim();
    const createdAt = new Date().toISOString();
    const parentDriveId = currentScriptFolderId ?? driveFolders.scriptsId;
    const parentLogicalId = currentScriptFolderId ?? null;

    try {
      setIsProcessing(true);
      await ensureDriveToken();

      if (scriptMode === "file") {
        if (!scriptFiles.length) return;
        const file = scriptFiles[0];
        const response = await window.gapi.client.drive.files.create({
          resource: {
            name: name || file.name,
            parents: [parentDriveId],
            description: notes,
            appProperties: {
              vaultHub: "true",
              vaultHubType: "script-file",
              uploaderName: currentUser.name,
              uploaderEmail: currentUser.email,
              createdAt,
              originalName: file.name,
            },
          },
          media: {
            mimeType: file.type || "application/octet-stream",
            body: file,
          },
          fields: "id,name,mimeType,size",
        });
        const newItem = {
          id: response.result.id,
          type: "file",
          name: name || file.name,
          originalName: file.name,
          mimeType: response.result.mimeType || file.type || "application/octet-stream",
          size: Number(response.result.size || file.size || 0),
          notes,
          uploader: currentUser.name,
          uploaderEmail: currentUser.email,
          createdAt,
          parentId: parentLogicalId,
        };
        setScripts((prev) => [...prev, newItem]);
        setScriptFiles([]);
        event.currentTarget.reset();
        return;
      }

      if (!scriptFolderFiles.length) return;
      const files = Array.from(scriptFolderFiles);
      const defaultRootName = files[0]?.webkitRelativePath?.split("/")[0] || "Folder";
      const rootFolder = await createDriveFolder(name || defaultRootName, parentDriveId, {
        vaultHubType: "script-folder",
        uploaderName: currentUser.name,
        uploaderEmail: currentUser.email,
        createdAt,
      });
      const createdItems = [
        {
          id: rootFolder.id,
          type: "folder",
          name: rootFolder.name,
          notes,
          uploader: currentUser.name,
          uploaderEmail: currentUser.email,
          createdAt,
          parentId: parentLogicalId,
        },
      ];

      const pathToFolderId = new Map();
      pathToFolderId.set("", rootFolder.id);

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
            const parentPath = currentPath.split("/").slice(0, -1).join("/");
            const parentId = parentPath ? pathToFolderId.get(parentPath) : rootFolder.id;
            const folder = await createDriveFolder(segment, parentId, {
              vaultHubType: "script-folder",
              uploaderName: currentUser.name,
              uploaderEmail: currentUser.email,
              createdAt,
            });
            pathToFolderId.set(currentPath, folder.id);
            createdItems.push({
              id: folder.id,
              type: "folder",
              name: segment,
              notes,
              uploader: currentUser.name,
              uploaderEmail: currentUser.email,
              createdAt,
              parentId: parentPath ? pathToFolderId.get(parentPath) : rootFolder.id,
            });
          }
        }
        const parentPathKey = parts.join("/");
        const parentForFile = parentPathKey ? pathToFolderId.get(parentPathKey) : rootFolder.id;
        const fileResponse = await window.gapi.client.drive.files.create({
          resource: {
            name: fileName,
            parents: [parentForFile],
            description: notes,
            appProperties: {
              vaultHub: "true",
              vaultHubType: "script-file",
              uploaderName: currentUser.name,
              uploaderEmail: currentUser.email,
              createdAt,
              originalName: file.name,
            },
          },
          media: {
            mimeType: file.type || "application/octet-stream",
            body: file,
          },
          fields: "id,name,mimeType,size",
        });
        createdItems.push({
          id: fileResponse.result.id,
          type: "file",
          name: fileName,
          originalName: file.name,
          mimeType: fileResponse.result.mimeType || file.type || "application/octet-stream",
          size: Number(fileResponse.result.size || file.size || 0),
          notes,
          uploader: currentUser.name,
          uploaderEmail: currentUser.email,
          createdAt,
          parentId: parentForFile,
        });
      }

      setScripts((prev) => [...prev, ...createdItems]);
      setScriptFolderFiles([]);
      event.currentTarget.reset();
    } catch (error) {
      handleDriveError(error);
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

  const removeScriptItem = useCallback(
    (id) => {
      const ids = new Set([id]);
      const queue = [id];
      while (queue.length) {
        const current = queue.shift();
        scripts.forEach((item) => {
          if (item.parentId === current && !ids.has(item.id)) {
            ids.add(item.id);
            queue.push(item.id);
          }
        });
      }
      setScripts((prev) => prev.filter((item) => !ids.has(item.id)));
      setSelectedItems((prev) => prev.filter((item) => !(item.category === "scripts" && ids.has(item.id))));
      setPreview((prevPreview) => {
        if (prevPreview && prevPreview.category === "scripts" && ids.has(prevPreview.item.id)) {
          return null;
        }
        return prevPreview;
      });
      setCurrentScriptFolderId((currentId) => (currentId && ids.has(currentId) ? null : currentId));
    },
    [scripts]
  );

  const handleDelete = async (category, id) => {
    try {
      setIsProcessing(true);
      await ensureDriveToken();
      await window.gapi.client.drive.files.delete({ fileId: id });
      if (category === "prompts") {
        setPrompts((prev) => prev.filter((item) => item.id !== id));
        setSelectedItems((prev) => prev.filter((item) => !(item.category === category && item.id === id)));
        setPreview((prevPreview) =>
          prevPreview && prevPreview.category === category && prevPreview.item.id === id ? null : prevPreview
        );
        return;
      }
      if (category === "links") {
        setLinks((prev) => prev.filter((item) => item.id !== id));
        setSelectedItems((prev) => prev.filter((item) => !(item.category === category && item.id === id)));
        setPreview((prevPreview) =>
          prevPreview && prevPreview.category === category && prevPreview.item.id === id ? null : prevPreview
        );
        return;
      }
      removeScriptItem(id);
    } catch (error) {
      handleDriveError(error);
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
      const response = await driveApiFetch(
        `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`
      );
      const buffer = new Uint8Array(await response.arrayBuffer());
      entries.push({
        path: pathSegments.join("/"),
        data: buffer,
        crc: crc32(buffer),
        date: new Date(item.createdAt),
      });
      return entries;
    },
    [driveApiFetch, scripts]
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
        const response = await driveApiFetch(
          `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`
        );
        const blob = await response.blob();
        downloadBlob(blob, item.name);
        return;
      }
      const entries = await gatherScriptEntries(item);
      const zip = createZip(entries);
      downloadBlob(zip, `${safeFileName(item.name)}.zip`);
    } catch (error) {
      handleDriveError(error);
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
        const response = await driveApiFetch(
          `https://www.googleapis.com/drive/v3/files/${script.id}?alt=media`
        );
        const buffer = new Uint8Array(await response.arrayBuffer());
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
  }, [
    gatherScriptEntries,
    driveApiFetch,
    links,
    prompts,
    scriptsById,
    selectedItems,
  ]);

  const handleBulkDownload = async () => {
    if (!selectedItems.length) return;
    try {
      setIsProcessing(true);
      const entries = await gatherSelectionEntries();
      if (!entries.length) return;
      const zip = createZip(entries);
      downloadBlob(zip, `vault-bulk-download-${Date.now()}.zip`);
    } catch (error) {
      handleDriveError(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (!editingItem) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    if (!name) return;

    try {
      setIsProcessing(true);
      await ensureDriveToken();

      if (editingItem.category === "prompts") {
        const description = String(form.get("description") || "").trim();
        const payload = {
          name,
          description,
          notes,
          uploader: editingItem.item.uploader,
          uploaderEmail: editingItem.item.uploaderEmail,
          createdAt: editingItem.item.createdAt,
        };
        await window.gapi.client.drive.files.update({
          fileId: editingItem.item.id,
          resource: {
            name: safeFileName(name, "json"),
            description: notes,
          },
          media: {
            mimeType: "application/json",
            body: new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
          },
        });
        setPrompts((prev) =>
          prev.map((entry) =>
            entry.id === editingItem.item.id ? { ...entry, name, description, notes } : entry
          )
        );
        setPreview((prevPreview) => {
          if (!prevPreview || prevPreview.category !== "prompts" || prevPreview.item.id !== editingItem.item.id) {
            return prevPreview;
          }
          return {
            ...prevPreview,
            item: { ...prevPreview.item, name, description, notes },
          };
        });
      } else if (editingItem.category === "links") {
        const url = String(form.get("url") || "").trim();
        const payload = {
          name,
          url,
          notes,
          uploader: editingItem.item.uploader,
          uploaderEmail: editingItem.item.uploaderEmail,
          createdAt: editingItem.item.createdAt,
        };
        await window.gapi.client.drive.files.update({
          fileId: editingItem.item.id,
          resource: {
            name: safeFileName(name, "json"),
            description: notes,
          },
          media: {
            mimeType: "application/json",
            body: new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
          },
        });
        setLinks((prev) =>
          prev.map((entry) => (entry.id === editingItem.item.id ? { ...entry, name, url, notes } : entry))
        );
        setPreview((prevPreview) => {
          if (!prevPreview || prevPreview.category !== "links" || prevPreview.item.id !== editingItem.item.id) {
            return prevPreview;
          }
          return {
            ...prevPreview,
            item: { ...prevPreview.item, name, url, notes },
          };
        });
      } else if (editingItem.category === "scripts") {
        await window.gapi.client.drive.files.update({
          fileId: editingItem.item.id,
          resource: {
            name,
            description: notes,
          },
        });
        setScripts((prev) =>
          prev.map((entry) =>
            entry.id === editingItem.item.id
              ? {
                  ...entry,
                  name,
                  notes,
                  ...(entry.type === "file" ? { originalName: name } : {}),
                }
              : entry
          )
        );
        setPreview((prevPreview) => {
          if (!prevPreview || prevPreview.category !== "scripts" || prevPreview.item.id !== editingItem.item.id) {
            return prevPreview;
          }
          return {
            ...prevPreview,
            item: {
              ...prevPreview.item,
              name,
              notes,
              ...(prevPreview.item.type === "file" ? { originalName: name } : {}),
            },
          };
        });
      }

      setEditingItem(null);
    } catch (error) {
      handleDriveError(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const openContextMenu = (event, category, item) => {
    event.preventDefault();
    setContextMenu({ category, item, x: event.clientX, y: event.clientY });
  };

  const renderListItem = (category, item) => {
    const isActive = preview && preview.category === category && preview.item.id === item.id;
    const isSelected = selectedItems.some((entry) => entry.category === category && entry.id === item.id);
    const Icon = category === "prompts" ? FileText : category === "links" ? Link2 : item.type === "folder" ? Folder : FileText;

    return (
      <div
        key={item.id}
        onClick={() => setPreview({ category, item })}
        onDoubleClick={() => {
          if (category === "scripts" && item.type === "folder") {
            setCurrentScriptFolderId(item.id);
          }
        }}
        onContextMenu={(event) => openContextMenu(event, category, item)}
        className={`group flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 transition hover:border-white/10 hover:bg-white/10 ${
          isActive ? "border-[#2ea043] bg-[#238636]/10" : ""
        }`}
      >
        <div className="flex flex-1 items-center gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelection(category, item.id)}
            onClick={(event) => event.stopPropagation()}
            className="h-4 w-4 rounded border-white/20 bg-transparent text-[#2ea043] focus:ring-0"
          />
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{item.name}</p>
            <p className="mt-0.5 truncate text-xs text-slate-400">
              Uploaded by {item.uploader} · {formatDateTime(item.createdAt)}
            </p>
          </div>
          {category === "scripts" && item.type === "file" && (
            <span className="text-xs text-slate-500">{(item.size / 1024).toFixed(1)} KB</span>
          )}
        </div>
        <button
          onClick={(event) => {
            event.stopPropagation();
            openContextMenu(event, category, item);
          }}
          className="rounded-md p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    );
  };

  const adminOnly = currentUser?.role === "admin";

  const renderContextMenu = () => {
    if (!contextMenu) return null;
    const style = { top: contextMenu.y, left: contextMenu.x };
    return (
      <div
        style={style}
        onClick={(event) => event.stopPropagation()}
        className="fixed z-50 w-44 overflow-hidden rounded-lg border border-white/10 bg-[#161b22] shadow-2xl"
      >
        <button
          disabled={isBusy || !driveReadyForActions}
          onClick={async () => {
            await handleDownload(contextMenu.category, contextMenu.item);
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Download
        </button>
        <button
          disabled={isBusy || !driveReadyForActions}
          onClick={() => {
            setEditingItem({ category: contextMenu.category, item: contextMenu.item });
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PencilLine className="h-4 w-4" /> Edit
        </button>
        <button
          disabled={isBusy || !driveReadyForActions}
          onClick={async () => {
            await handleDelete(contextMenu.category, contextMenu.item.id);
            setContextMenu(null);
          }}
          className="flex w-full items-center gap-2 px-4 py-2 text-sm text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
      </div>
    );
  };
  const renderPreview = () => {
    if (!preview) {
      return (
        <Card className="border-white/5 bg-white/5 text-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg font-semibold text-white">
              <Database className="h-5 w-5" /> Item Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400">
              Select an item on the left to inspect metadata, notes, and quick actions. Notes will appear here for easy review.
            </p>
          </CardContent>
        </Card>
      );
    }

    const { category, item } = preview;

    return (
      <Card className="border-white/5 bg-white/5 text-slate-200">
        <CardHeader className="flex flex-col gap-2">
          <CardTitle className="flex items-center gap-3 text-lg font-semibold text-white">
            {category === "prompts" && <FileText className="h-5 w-5" />}
            {category === "links" && <Link2 className="h-5 w-5" />}
            {category === "scripts" && (item.type === "folder" ? <Folder className="h-5 w-5" /> : <FileText className="h-5 w-5" />)}
            {item.name}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Badge className="bg-white/10 text-xs text-white">{category.toUpperCase()}</Badge>
            <span>Uploaded by {item.uploader}</span>
            <span>· {formatDateTime(item.createdAt)}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {category === "prompts" && (
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Description</p>
                <p className="mt-1 rounded-lg border border-white/5 bg-black/20 p-3 text-sm text-slate-100">
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
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">URL</p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm text-[#58a6ff] hover:text-white"
                >
                  <Link2 className="h-4 w-4" /> {item.url}
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
            <div className="space-y-3">
              {item.type === "file" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm">
                    <span className="text-slate-300">Original file</span>
                    <span className="text-slate-400">{item.originalName}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm">
                    <span className="text-slate-300">Size</span>
                    <span className="text-slate-400">{(item.size / 1024).toFixed(1)} KB</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Folder contents</p>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-white/5 bg-black/20 p-3 text-sm">
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
              disabled={isBusy || !driveReadyForActions}
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
        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#161b22] p-6 shadow-2xl">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-semibold text-white">Edit {category.slice(0, 1).toUpperCase() + category.slice(1)}</h3>
              <p className="mt-1 text-sm text-slate-400">Update the name or notes for this entry.</p>
            </div>
            <button onClick={() => setEditingItem(null)} className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white">
              ✕
            </button>
          </div>
          <form onSubmit={handleEditSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Name</label>
              <Input name="name" defaultValue={item.name} className="mt-2 border-white/10 bg-black/40 text-white" />
            </div>
            {category === "prompts" && (
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Description</label>
                <Textarea
                  name="description"
                  defaultValue={item.description}
                  className="mt-2 min-h-[100px] border-white/10 bg-black/40 text-white"
                />
              </div>
            )}
            {category === "links" && (
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">URL</label>
                <Input name="url" defaultValue={item.url} className="mt-2 border-white/10 bg-black/40 text-white" />
              </div>
            )}
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Notes</label>
              <Textarea name="notes" defaultValue={item.notes} className="mt-2 min-h-[120px] border-white/10 bg-black/40 text-white" />
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

  const renderAuthScreen = () => (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#010409] via-[#0d1117] to-[#1f6feb]/20 px-6 py-12 text-white">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#238636]/20 text-[#3fb950]">
            <Lock className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-3xl font-bold">VaultHub Login</h1>
          <p className="mt-2 text-sm text-slate-400">
            Securely store prompts, scripts, and research links for your creative team. Only approved email addresses can register.
          </p>
        </div>
        <Card className="border-white/10 bg-[#161b22] text-white">
          <CardContent className="space-y-6 pt-6">
            <div className="flex rounded-full border border-white/10 bg-black/30 p-1 text-sm">
              <button
                onClick={() => {
                  setAuthView("login");
                  setAuthError("");
                }}
                className={`flex-1 rounded-full px-4 py-2 transition ${authView === "login" ? "bg-[#238636]" : "hover:bg-white/5"}`}
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
                className={`flex-1 rounded-full px-4 py-2 transition ${authView === "register" ? "bg-[#1f6feb]" : "hover:bg-white/5"}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <UserPlus className="h-4 w-4" /> Register
                </div>
              </button>
            </div>
            {authError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {authError}
              </div>
            )}
            <form onSubmit={handleAuth} className="space-y-4">
              {authView === "register" && (
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">Name</label>
                  <Input name="name" placeholder="How should we call you?" className="mt-1 border-white/10 bg-black/40 text-white" />
                </div>
              )}
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Email</label>
                <Input name="email" type="email" placeholder="you@example.com" className="mt-1 border-white/10 bg-black/40 text-white" required />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Password</label>
                <Input name="password" type="password" placeholder="••••••••" className="mt-1 border-white/10 bg-black/40 text-white" required />
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
            <p className="text-center text-xs text-slate-500">
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
          <p className="mt-1 text-sm text-slate-400">Manage who can register, review members, and keep your workspace secure.</p>
        </div>
        <Badge className="bg-[#238636]/20 text-[#3fb950]">
          <ShieldCheck className="mr-2 h-4 w-4" /> Administrator
        </Badge>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-white/10 bg-[#161b22] text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Users className="h-5 w-5 text-[#58a6ff]" /> Approved email list
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const email = String(form.get("email") || "").trim().toLowerCase();
                if (!email || allowedEmails.includes(email)) return;
                setAllowedEmails((prev) => [...prev, email]);
                event.currentTarget.reset();
              }}
              className="flex gap-3"
            >
              <Input name="email" placeholder="new-user@example.com" className="border-white/10 bg-black/40 text-white" />
              <Button type="submit" className="bg-[#1f6feb] text-white hover:bg-[#388bfd]">
                Grant access
              </Button>
            </form>
            <div className="space-y-2">
              {allowedEmails.map((email) => (
                <div key={email} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/30 px-4 py-2 text-sm">
                  <span className="text-slate-200">{email}</span>
                  {!protectedAdminEmails.has(email) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAllowedEmails((prev) => prev.filter((value) => value !== email));
                        setUsers((prev) => prev.filter((user) => user.email !== email));
                      }}
                      className="border-white/10 bg-white/5 text-rose-300 hover:bg-rose-500/20"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              {!allowedEmails.length && <p className="text-sm text-slate-500">No email addresses have been approved yet.</p>}
            </div>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-[#161b22] text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Users className="h-5 w-5 text-[#238636]" /> Registered members
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/30 px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-white">{user.name}</p>
                  <p className="text-xs text-slate-400">{user.email}</p>
                </div>
                <Badge className="bg-white/10 text-xs text-slate-300">{user.role === "admin" ? "Admin" : "Member"}</Badge>
              </div>
            ))}
            {!users.length && <p className="text-sm text-slate-500">No one has registered yet.</p>}
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
          <p className="mt-2 text-sm text-slate-400">Organise prompts, automation scripts, and research links with a familiar GitHub aesthetic.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => setActiveView(activeView === "dashboard" ? "admin" : "dashboard")}
            className="bg-[#1f6feb] text-white hover:bg-[#388bfd]"
          >
            <ShieldCheck className="mr-2 h-4 w-4" /> {activeView === "dashboard" ? "Admin panel" : "Back to dashboard"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setCurrentUser(null);
              setPreview(null);
              setSelectedItems([]);
              setAuthView("login");
              setActiveView("dashboard");
              setActiveTab("prompts");
              setCurrentScriptFolderId(null);
            }}
            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>

      {activeView === "admin" && !adminOnly && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          You need administrator rights to manage access. Ask an admin to promote your account.
        </div>
      )}

      {activeView === "admin" && adminOnly ? (
        renderAdminPanel()
      ) : (
        <>
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
                  <h2 className="text-xl font-semibold text-white">Workspace vault</h2>
                  <p className="text-sm text-slate-400">Double-click folders to open them, right-click items for quick actions.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Button
                  onClick={() => handleDriveConnect()}
                  disabled={!driveClientReady || missingDriveCredentials || isBusy}
                  className={`${
                    driveConnected
                      ? "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                      : "bg-[#1f6feb] text-white hover:bg-[#388bfd]"
                  } disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500`}
                >
                  <HardDrive className="mr-2 h-4 w-4" />
                  {isBusy
                    ? "Syncing..."
                    : driveConnected
                    ? "Refresh Drive"
                    : "Connect Google Drive"}
                </Button>
                {driveProfile && (
                  <span className="text-xs text-slate-400">
                    Connected as <span className="text-slate-200">{driveProfile.displayName}</span>
                    {driveProfile.emailAddress ? ` (${driveProfile.emailAddress})` : ""}
                  </span>
                )}
                <Button
                  onClick={() => handleBulkDownload()}
                  disabled={!selectedItems.length || isBusy || !driveReadyForActions}
                  className="bg-[#238636] text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                >
                  <Download className="mr-2 h-4 w-4" /> Bulk download ({selectedItems.length})
                </Button>
              </div>
            </div>

            {driveError && (
              <div className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
                <p className="font-medium text-rose-100">{driveError}</p>
                {driveErrorInfo?.detail && (
                  <p className="mt-2 whitespace-pre-line text-xs text-rose-100/80">
                    Google Drive replied: {driveErrorInfo.detail}
                  </p>
                )}
                {driveErrorInfo?.hint && (
                  <p className="mt-3 text-xs text-rose-100/70">
                    Try this next: {driveErrorInfo.hint}
                  </p>
                )}
                {(driveErrorInfo?.reason || driveErrorInfo?.status || driveErrorInfo?.code) && (
                  <p className="mt-3 text-[11px] font-mono text-rose-100/50">
                    Debug codes → reason: {driveErrorInfo?.reason ?? "n/a"} | status: {driveErrorInfo?.status ?? "n/a"} | code: {driveErrorInfo?.code ?? "n/a"}
                  </p>
                )}
              </div>
            )}
            {!driveError && driveBootstrapMessage && (
              <div className="mt-4 rounded-2xl border border-slate-500/30 bg-slate-500/10 p-4 text-sm text-slate-200">
                {driveBootstrapMessage}
              </div>
            )}
            {!driveError && !driveBootstrapMessage && !driveReadyForActions && !isBusy && (
              <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                {missingDriveCredentials
                  ? "Add your Google API credentials to enable Google Drive storage."
                  : "Connect Google Drive to start uploading prompts, scripts, and links."}
              </div>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr,1fr]">
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setActiveTab(category.id)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        activeTab === category.id ? "bg-white/10 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"
                      }`}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>

                {activeTab === "prompts" && (
                  <form onSubmit={handleAddPrompt} className="rounded-2xl border border-white/5 bg-white/5 p-5 space-y-4">
                    <div className="flex items-center gap-3 text-sm text-slate-300">
                      <UploadCloud className="h-5 w-5 text-[#3fb950]" /> Store a new prompt
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-slate-400">Name</label>
                      <Input name="name" placeholder="Prompt title" className="mt-1 border-white/10 bg-black/40 text-white" required />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-slate-400">Description</label>
                      <Textarea name="description" placeholder="Short summary" className="mt-1 min-h-[80px] border-white/10 bg-black/40 text-white" />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-slate-400">Notes</label>
                      <Textarea name="notes" placeholder="Paste the full prompt or any reminders" className="mt-1 min-h-[120px] border-white/10 bg-black/40 text-white" />
                    </div>
                    <Button
                      type="submit"
                      disabled={!driveReadyForActions || isBusy}
                      className="bg-[#238636] text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                    >
                      Save prompt
                    </Button>
                  </form>
                )}

                {activeTab === "scripts" && (
                  <form onSubmit={handleAddScript} className="rounded-2xl border border-white/5 bg-white/5 p-5 space-y-4">
                    <div className="flex items-center gap-3 text-sm text-slate-300">
                      <UploadCloud className="h-5 w-5 text-[#58a6ff]" /> Upload automation scripts
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setScriptMode("file")}
                        className={`flex-1 rounded-xl border px-4 py-2 text-sm transition ${
                          scriptMode === "file" ? "border-[#1f6feb] bg-[#1f6feb]/20 text-[#58a6ff]" : "border-white/10 bg-black/30 text-slate-300 hover:border-white/20"
                        }`}
                      >
                        Single file
                      </button>
                      <button
                        type="button"
                        onClick={() => setScriptMode("folder")}
                        className={`flex-1 rounded-xl border px-4 py-2 text-sm transition ${
                          scriptMode === "folder" ? "border-[#1f6feb] bg-[#1f6feb]/20 text-[#58a6ff]" : "border-white/10 bg-black/30 text-slate-300 hover:border-white/20"
                        }`}
                      >
                        Full folder
                      </button>
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-slate-400">Name</label>
                      <Input name="name" placeholder="Display name" className="mt-1 border-white/10 bg-black/40 text-white" />
                    </div>
                    {scriptMode === "file" ? (
                      <div>
                        <label className="text-xs uppercase tracking-wide text-slate-400">Choose file</label>
                        <Input
                          type="file"
                          disabled={!driveReadyForActions || isBusy}
                          onChange={(event) => setScriptFiles(Array.from(event.target.files || []))}
                          className="mt-1 border-white/10 bg-black/40 text-white file:mr-3 file:rounded-lg file:border-0 file:bg-[#1f6feb] file:px-4 file:py-2 file:text-sm file:text-white disabled:cursor-not-allowed"
                        />
                        {scriptFiles.length > 0 && (
                          <p className="mt-2 text-xs text-slate-400">Selected: {scriptFiles[0].name}</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <label className="text-xs uppercase tracking-wide text-slate-400">Select folder</label>
                        <Input
                          ref={folderInputRef}
                          type="file"
                          multiple
                          disabled={!driveReadyForActions || isBusy}
                          onChange={(event) => setScriptFolderFiles(Array.from(event.target.files || []))}
                          className="mt-1 border-white/10 bg-black/40 text-white file:mr-3 file:rounded-lg file:border-0 file:bg-[#1f6feb] file:px-4 file:py-2 file:text-sm file:text-white disabled:cursor-not-allowed"
                        />
                        {scriptFolderFiles.length > 0 && (
                          <p className="mt-2 text-xs text-slate-400">{scriptFolderFiles.length} items ready to upload</p>
                        )}
                      </div>
                    )}
                    <div>
                      <label className="text-xs uppercase tracking-wide text-slate-400">Notes</label>
                      <Textarea name="notes" placeholder="Context, setup steps, secrets, etc." className="mt-1 min-h-[120px] border-white/10 bg-black/40 text-white" />
                    </div>
                    <Button
                      type="submit"
                      disabled={!driveReadyForActions || isBusy}
                      className="bg-[#1f6feb] text-white hover:bg-[#388bfd] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                    >
                      Upload
                    </Button>
                  </form>
                )}

                {activeTab === "links" && (
                  <form onSubmit={handleAddLink} className="rounded-2xl border border-white/5 bg-white/5 p-5 space-y-4">
                    <div className="flex items-center gap-3 text-sm text-slate-300">
                      <UploadCloud className="h-5 w-5 text-[#bf3989]" /> Save a research link
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-slate-400">Name</label>
                      <Input name="name" placeholder="Resource name" className="mt-1 border-white/10 bg-black/40 text-white" required />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-slate-400">URL</label>
                      <Input name="url" type="url" placeholder="https://" className="mt-1 border-white/10 bg-black/40 text-white" required />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-slate-400">Notes</label>
                      <Textarea name="notes" placeholder="Why this link matters" className="mt-1 min-h-[120px] border-white/10 bg-black/40 text-white" />
                    </div>
                    <Button
                      type="submit"
                      disabled={!driveReadyForActions || isBusy}
                      className="bg-[#bf3989] text-white hover:bg-[#f778ba] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                    >
                      Save link
                    </Button>
                  </form>
                )}

                <div className="space-y-3">
                  {activeTab === "prompts" &&
                    (prompts.length ? (
                      prompts.slice().reverse().map((prompt) => renderListItem("prompts", prompt))
                    ) : (
                      <EmptyState icon={FileText} title="No prompts yet" description="Upload your go-to prompt templates to access them quickly across projects." />
                    ))}
                  {activeTab === "scripts" &&
                    (scriptsInView.length ? (
                      <>
                        <ScriptBreadcrumb breadcrumbs={scriptBreadcrumbs} onNavigate={setCurrentScriptFolderId} />
                        {scriptsInView.map((script) => renderListItem("scripts", script))}
                      </>
                    ) : (
                      <EmptyState icon={Folder} title="This folder is empty" description="Drag in a folder or upload a script file to start building your automation library." />
                    ))}
                  {activeTab === "links" &&
                    (links.length ? (
                      links.slice().reverse().map((link) => renderListItem("links", link))
                    ) : (
                      <EmptyState icon={Link2} title="No links saved" description="Collect tutorials, documentation, and reference URLs so your whole team stays aligned." />
                    ))}
                </div>
              </div>

              <div className="space-y-6">
                {renderPreview()}
              </div>
            </div>
          </div>
        </>
      )}
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
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-10">
        {renderDashboard()}
      </div>
      {renderContextMenu()}
      {renderEditDrawer()}
    </div>
  );
}

