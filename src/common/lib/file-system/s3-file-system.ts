import type {FileSystem} from "./file-system.js";
import {S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand} from "@aws-sdk/client-s3";
import type {Config} from "../../../config/config";
import {promises} from "fs";
import {dirname} from "crosspath";

export class S3FileSystem implements FileSystem {
	private s3Client: S3Client;
	private bucket: string;

	constructor(private readonly config: Config) {
		if (!config.s3Bucket) {
			throw new Error("S3_BUCKET must be configured when using S3 storage");
		}
		
		this.bucket = config.s3Bucket;
		
		const s3Config: any = {
			region: config.s3Region || "us-east-1",
		};

		// If access key is provided, use it
		if (config.s3AccessKeyId && config.s3SecretAccessKey) {
			s3Config.credentials = {
				accessKeyId: config.s3AccessKeyId,
				secretAccessKey: config.s3SecretAccessKey,
			};
		}

		// If a custom endpoint is provided (e.g. MinIO, R2, etc.)
		if (config.s3Endpoint) {
			s3Config.endpoint = config.s3Endpoint;
			s3Config.forcePathStyle = config.s3ForcePathStyle;
		}

		this.s3Client = new S3Client(s3Config);
	}

	private getS3Key(path: string): string {
		// Remove the leading / and s3:// prefix
		return path.replace(/^(s3:\/\/|\/?)/, "").replace(/^\/+/, "");
	}

	private isS3Path(path: string): boolean {
		return path.startsWith("s3://") || this.config.enableS3Storage;
	}

	async exists(path: string): Promise<boolean> {
		if (!this.isS3Path(path)) {
			// Fallback to local file system
			try {
				await promises.stat(path);
				return true;
			} catch {
				return false;
			}
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
			// 回退到本地文件系统
			if (!(await this.exists(path))) return undefined;
			try {
				return promises.readFile(path);
			} catch {
				return undefined;
			}
		}

		if (!(await this.exists(path))) return undefined;
		
		try {
			const response = await this.s3Client.send(new GetObjectCommand({
				Bucket: this.bucket,
				Key: this.getS3Key(path)
			}));

			if (!response.Body) return undefined;

			// Convert Readable stream to Buffer
			const chunks: Uint8Array[] = [];
			const stream = response.Body as NodeJS.ReadableStream;
			
			return new Promise<Buffer>((resolve, reject) => {
				stream.on('data', (chunk: Uint8Array) => {
					chunks.push(chunk);
				});
				
				stream.on('end', () => {
					resolve(Buffer.concat(chunks));
				});
				
				stream.on('error', (error) => {
					reject(error);
				});
			});
		} catch {
			return undefined;
		}
	}

	async writeFile(path: string, content: string | Buffer): Promise<void> {
		if (!this.isS3Path(path)) {
			// Fallback to local file system
			try {
				await promises.mkdir(dirname(path), {recursive: true});
				return promises.writeFile(path, content as any);
			} catch {
				// The FileSystem might not allow mutations at the given path.
				// in any case, the operation failed
			}
			return;
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
			// Fallback to local file system
			try {
				await promises.rm(path, {force: true, recursive: true});
				return true;
			} catch {
				return false;
			}
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