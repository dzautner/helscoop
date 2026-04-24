import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";

export type ProjectImageVariant = "original" | "thumb200" | "thumb800";

const DEFAULT_STORAGE_DIR = path.join(os.tmpdir(), "helscoop-project-images");
let s3Client: S3Client | null = null;

export function projectImageStorageRoot(): string {
  return process.env.PROJECT_IMAGE_STORAGE_DIR || DEFAULT_STORAGE_DIR;
}

function projectImageS3Bucket(): string | null {
  return process.env.PROJECT_IMAGE_S3_BUCKET || null;
}

function projectImageS3Client(): S3Client {
  if (s3Client) return s3Client;
  const config: S3ClientConfig = {
    region: process.env.PROJECT_IMAGE_S3_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-north-1",
  };
  if (process.env.PROJECT_IMAGE_S3_ENDPOINT) {
    config.endpoint = process.env.PROJECT_IMAGE_S3_ENDPOINT;
  }
  if (process.env.PROJECT_IMAGE_S3_FORCE_PATH_STYLE === "true") {
    config.forcePathStyle = true;
  }
  if (process.env.PROJECT_IMAGE_S3_ACCESS_KEY_ID && process.env.PROJECT_IMAGE_S3_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.PROJECT_IMAGE_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.PROJECT_IMAGE_S3_SECRET_ACCESS_KEY,
    };
  }
  s3Client = new S3Client(config);
  return s3Client;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) throw new Error("Missing object body");
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Unsupported object body");
}

export function safeProjectImagePath(storageKey: string): string {
  if (!storageKey || path.isAbsolute(storageKey) || storageKey.includes("..")) {
    throw new Error("Invalid image storage key");
  }
  return path.join(projectImageStorageRoot(), storageKey);
}

export async function writeProjectImageObject(storageKey: string, bytes: Buffer): Promise<void> {
  const bucket = projectImageS3Bucket();
  if (bucket) {
    await projectImageS3Client().send(new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: bytes,
      ContentType: "image/jpeg",
    }));
    return;
  }

  const filePath = safeProjectImagePath(storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes);
}

export async function readProjectImageObject(storageKey: string): Promise<Buffer> {
  const bucket = projectImageS3Bucket();
  if (bucket) {
    const result = await projectImageS3Client().send(new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    }));
    return bodyToBuffer(result.Body);
  }

  return fs.readFile(safeProjectImagePath(storageKey));
}

export async function deleteProjectImageObjects(storageKeys: Array<string | null | undefined>): Promise<void> {
  const keys = storageKeys.filter(Boolean) as string[];
  const bucket = projectImageS3Bucket();
  if (bucket) {
    if (keys.length === 0) return;
    await projectImageS3Client().send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: keys.map((Key) => ({ Key })),
        Quiet: true,
      },
    }));
    return;
  }

  await Promise.all(keys.map(async (key) => {
    try {
      await fs.unlink(safeProjectImagePath(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }));
}
