import {S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, type S3ClientConfig} from "@aws-sdk/client-s3";

import type {Config} from "../../../config/config";
import {RealFileSystem} from "./real-file-system.js";

export class S3FileSystem extends RealFileSystem {
	private s3Client: S3Client;
	private bucket: string;

	constructor(private readonly config: Config) {
		super();
		
		if (!config.s3Storage?.bucket) {
			throw new Error("S3_BUCKET must be configured when using S3 storage");
		}
		
		this.bucket = config.s3Storage.bucket;
		
		const s3Config: S3ClientConfig = {
			region: config.s3Storage.region || "us-east-1",
		};

		// If access key is provided, use it
		if (config.s3Storage.accessKeyId && config.s3Storage.secretAccessKey) {
			s3Config.credentials = {
				accessKeyId: config.s3Storage.accessKeyId,
				secretAccessKey: config.s3Storage.secretAccessKey,
			};
		}

		// If a custom endpoint is provided (e.g. MinIO, R2, etc.)
		if (config.s3Storage.endpoint) {
			s3Config.endpoint = config.s3Storage.endpoint;
			s3Config.forcePathStyle = config.s3Storage.forcePathStyle;
		}

		this.s3Client = new S3Client(s3Config);
	}

	private getS3Key(path: string): string {
		// Remove the leading / and s3:// prefix
		return path.replace(/^(s3:\/\/|\/?)/, "").replace(/^\/+/, "");
	}

	private isS3Path(path: string): boolean {
		return path.startsWith("s3://") || !!this.config.s3Storage;
	}

	async exists(path: string): Promise<boolean> {
		if (!this.isS3Path(path)) {
			return super.exists(path);
		}

		try {
			await this.s3Client.send(new HeadObjectCommand({
				Bucket: this.bucket,
				Key: this.getS3Key(path)
			}));
			return true;
		} catch {
			return false;
		}
	}

	async readFile(path: string): Promise<Buffer | undefined> {
		if (!this.isS3Path(path)) {
			return super.readFile(path);
		}

		if (!(await this.exists(path))) return undefined;
		
		try {
			const response = await this.s3Client.send(new GetObjectCommand({
				Bucket: this.bucket,
				Key: this.getS3Key(path)
			}));

			if (!response.Body) return undefined;

			// Convert Readable stream to Buffer
			const chunks = await Array.fromAsync(response.Body as NodeJS.ReadableStream);
			const buffers = chunks.map(chunk => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
			
			return Buffer.concat(buffers as any);
		} catch {
			return undefined;
		}
	}

	async writeFile(path: string, content: string | Buffer): Promise<void> {
		if (!this.isS3Path(path)) {
			return super.writeFile(path, content);
		}

		try {
			await this.s3Client.send(new PutObjectCommand({
				Bucket: this.bucket,
				Key: this.getS3Key(path),
				Body: content instanceof Buffer ? content : Buffer.from(content)
			}));
		} catch {
			// S3 write failed, operation unsuccessful
		}
	}

	async delete(path: string): Promise<boolean> {
		if (!this.isS3Path(path)) {
			return super.delete(path);
		}

		try {
			await this.s3Client.send(new DeleteObjectCommand({
				Bucket: this.bucket,
				Key: this.getS3Key(path)
			}));
			return true;
		} catch {
			return false;
		}
	}
} 