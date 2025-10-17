const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

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
const bucketName = resolveEnv("R2_BUCKET");
const region = resolveEnv("R2_REGION") || "auto";

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  console.warn(
    "Cloudflare R2 credentials are missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET to enable uploads."
  );
}

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

const allowCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: allowCors };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: allowCors,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const bucket = bucketName;
    if (!bucket) {
      throw new Error("R2 bucket is not configured.");
    }

    const { action, key, contentType } = JSON.parse(event.body || "{}");
    if (!action || !key) {
      return {
        statusCode: 400,
        headers: allowCors,
        body: JSON.stringify({ error: "Missing action or key" }),
      };
    }

    let command;
    if (action === "upload") {
      command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType || "application/octet-stream",
      });
    } else if (action === "download") {
      command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
    } else {
      return {
        statusCode: 400,
        headers: allowCors,
        body: JSON.stringify({ error: "Unsupported action" }),
      };
    }

    const url = await getSignedUrl(s3, command, { expiresIn: 60 * 5 });
    return {
      statusCode: 200,
      headers: allowCors,
      body: JSON.stringify({ url }),
    };
  } catch (error) {
    console.error("Failed to generate presigned URL", error);
    return {
      statusCode: 500,
      headers: allowCors,
      body: JSON.stringify({ error: error.message || "Unknown error" }),
    };
  }
};
