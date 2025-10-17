const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const requiredEnv = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.warn(`Missing environment variable ${key} for R2 integration.`);
  }
}

const s3 = new S3Client({
  region: process.env.R2_REGION || "auto",
  endpoint: process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : undefined,
  credentials:
    process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
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
    const bucket = process.env.R2_BUCKET;
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
