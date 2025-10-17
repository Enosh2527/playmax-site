const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");

const DEFAULT_R2_CONFIG = {
  R2_ACCESS_KEY_ID: "33f46d555ee615172b0ce1cb58017638",
  R2_SECRET_ACCESS_KEY:
    "d36aa75d050d65f8dce2affa9ba51bd5d3437a623a95792ddc97b5455bcabd6f",
  R2_ACCOUNT_ID: "cdb6fe7f2b93a9c99d0966ae16f28826",
  R2_BUCKET: "vault-files",
  R2_REGION: "auto",
};

const resolveEnv = (key) => process.env[key] || DEFAULT_R2_CONFIG[key];

const accountId = resolveEnv("R2_ACCOUNT_ID");
const accessKeyId = resolveEnv("R2_ACCESS_KEY_ID");
const secretAccessKey = resolveEnv("R2_SECRET_ACCESS_KEY");
const region = resolveEnv("R2_REGION") || "auto";
const BUCKET = resolveEnv("R2_BUCKET");

const s3 = new S3Client({
  region,
  endpoint: accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined,
  credentials:
    accessKeyId && secretAccessKey
      ? {
          accessKeyId,
          secretAccessKey,
        }
      : undefined,
  forcePathStyle: true,
});
const STORE_KEY = "vault/metadata.json";

const initialAllowedEmails = ["admin@vaulthub.dev", "rajhanoch24@gmail.com"].map((email) =>
  email.toLowerCase()
);

const initialStore = {
  version: 1,
  prompts: [],
  links: [],
  scripts: [],
  allowed_emails: initialAllowedEmails.map((email) => ({
    email,
    role: "admin",
    created_at: new Date().toISOString(),
  })),
};

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (error) => reject(error));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

function ensureStoreShape(store) {
  if (!store || typeof store !== "object") {
    return JSON.parse(JSON.stringify(initialStore));
  }
  const next = { ...initialStore, ...store };
  next.prompts = Array.isArray(store.prompts) ? store.prompts : [];
  next.links = Array.isArray(store.links) ? store.links : [];
  next.scripts = Array.isArray(store.scripts) ? store.scripts : [];
  next.allowed_emails = Array.isArray(store.allowed_emails)
    ? store.allowed_emails.map((entry) => ({
        email: String(entry.email || "").toLowerCase(),
        role: entry.role || "member",
        created_at: entry.created_at || new Date().toISOString(),
      }))
    : initialStore.allowed_emails;
  return next;
}

async function loadStore() {
  if (!BUCKET) {
    throw new Error("R2 bucket is not configured.");
  }
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: STORE_KEY,
      })
    );
    const payload = await streamToString(result.Body);
    return ensureStoreShape(JSON.parse(payload));
  } catch (error) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return ensureStoreShape(initialStore);
    }
    throw error;
  }
}

async function saveStore(store) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: STORE_KEY,
      Body: JSON.stringify(store, null, 2),
      ContentType: "application/json",
    })
  );
}

function parseRequest(event) {
  try {
    return JSON.parse(event.body || "{}") || {};
  } catch (error) {
    return {};
  }
}

function filterItems(items, params) {
  let result = items;
  for (const [rawKey, rawValue] of params.entries()) {
    if (rawKey === "select") continue;
    const value = rawValue || "";
    if (value.startsWith("eq.")) {
      const target = decodeURIComponent(value.slice(3));
      result = result.filter((item) => String(item[rawKey]) === target);
      continue;
    }
    if (value.startsWith("in.")) {
      const decoded = decodeURIComponent(value.slice(3));
      const match = decoded.match(/\((.*)\)/);
      if (match && match[1]) {
        const parts = match[1]
          .split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/)
          .map((entry) => entry.trim().replace(/^"|"$/g, ""));
        const set = new Set(parts.map((entry) => entry.replace(/\\"/g, '"')));
        result = result.filter((item) => set.has(String(item[rawKey])));
      }
      continue;
    }
  }
  return result;
}

function updateItems(items, params, updates) {
  const changed = [];
  const updated = items.map((item) => {
    const matches = filterItems([item], params).length > 0;
    if (!matches) return item;
    const next = { ...item, ...updates };
    changed.push(next);
    return next;
  });
  return { updated, changed };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "R2 credentials are not configured." }) };
  }

  const { path, method: rawMethod = "GET", body } = parseRequest(event);
  if (!path) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing path." }) };
  }

  const [tablePart, queryString = ""] = String(path).split("?");
  const table = tablePart.trim();
  if (!table) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing table name." }) };
  }

  const params = new URLSearchParams(queryString);
  const method = String(rawMethod || "GET").toUpperCase();

  try {
    const store = await loadStore();
    if (!Array.isArray(store[table])) {
      store[table] = [];
    }

    if (method === "GET") {
      const items = filterItems(store[table], params);
      return { statusCode: 200, body: JSON.stringify(items), headers: { "Content-Type": "application/json" } };
    }

    if (method === "POST") {
      const payload = body ? JSON.parse(body) : [];
      const rows = Array.isArray(payload) ? payload : [];
      store[table] = [...store[table], ...rows];
      await saveStore(store);
      return { statusCode: 200, body: JSON.stringify(rows), headers: { "Content-Type": "application/json" } };
    }

    if (method === "PATCH") {
      const updates = body ? JSON.parse(body) : {};
      const { updated, changed } = updateItems(store[table], params, updates);
      store[table] = updated;
      await saveStore(store);
      return {
        statusCode: 200,
        body: JSON.stringify(changed),
        headers: { "Content-Type": "application/json" },
      };
    }

    if (method === "DELETE") {
      const keep = store[table].filter((item) => filterItems([item], params).length === 0);
      store[table] = keep;
      await saveStore(store);
      return { statusCode: 200, body: JSON.stringify([]), headers: { "Content-Type": "application/json" } };
    }

    return { statusCode: 405, body: JSON.stringify({ error: "Unsupported method." }) };
  } catch (error) {
    console.error("Vault store error", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Unexpected storage error." }),
    };
  }
};
