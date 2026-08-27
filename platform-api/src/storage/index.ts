import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Config } from "../config.js";
import { AppError } from "../common/errors.js";

export interface StoredObject {
  key: string;
  checksum: string;
  size: number;
}
export interface ObjectStorage {
  put(
    organizationId: string,
    fileName: string,
    data: Buffer,
    mimeType?: string,
  ): Promise<StoredObject>;
  signedReadUrl?(key: string, expiresSeconds?: number): Promise<string>;
}

class LocalStorage implements ObjectStorage {
  constructor(private readonly root: string) {}
  async put(
    organizationId: string,
    fileName: string,
    data: Buffer,
  ): Promise<StoredObject> {
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180),
      key = `${organizationId}/${randomUUID()}-${safe}`;
    const target = resolve(this.root, key),
      root = resolve(this.root);
    if (!target.startsWith(`${root}/`))
      throw new AppError(
        "UNSAFE_STORAGE_KEY",
        "The storage key is invalid.",
        400,
      );
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data, { flag: "wx" });
    return {
      key,
      checksum: createHash("sha256").update(data).digest("hex"),
      size: data.length,
    };
  }
}

class S3Storage implements ObjectStorage {
  private readonly client: S3Client;
  constructor(private readonly config: Config) {
    if (!config.S3_BUCKET)
      throw new AppError(
        "STORAGE_NOT_CONFIGURED",
        "S3_BUCKET is required for external storage.",
        503,
      );
    this.client = new S3Client({
      region: config.S3_REGION,
      ...(config.S3_ENDPOINT_URL
        ? { endpoint: config.S3_ENDPOINT_URL, forcePathStyle: true }
        : {}),
      ...(config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: config.S3_ACCESS_KEY_ID,
              secretAccessKey: config.S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }
  async put(
    organizationId: string,
    fileName: string,
    data: Buffer,
    mimeType?: string,
  ): Promise<StoredObject> {
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180),
      key = `${organizationId}/${randomUUID()}-${safe}`,
      checksum = createHash("sha256").update(data).digest("hex");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.S3_BUCKET!,
        Key: key,
        Body: data,
        ...(mimeType ? { ContentType: mimeType } : {}),
        Metadata: { sha256: checksum },
      }),
    );
    return { key, checksum, size: data.length };
  }
  signedReadUrl(key: string, expiresSeconds = 300): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.S3_BUCKET!, Key: key }),
      { expiresIn: expiresSeconds },
    );
  }
}
export const createStorage = (config: Config): ObjectStorage =>
  config.STORAGE_BACKEND === "local"
    ? new LocalStorage(config.LOCAL_STORAGE_PATH)
    : new S3Storage(config);
