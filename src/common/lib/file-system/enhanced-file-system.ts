import type {FileSystem} from "./file-system";
import {realFileSystem} from "./real-file-system";
import {S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand} from "@aws-sdk/client-s3";
import type {Config} from "../../../config/config";

export function createEnhancedFileSystem(config: Config): FileSystem {
	// If S3 is not enabled, return the local file system
	if (!config.enableS3Storage) {
		return realFileSystem;
	}

	// Create S3 client
	const s3Client = createS3Client(config);
	const bucket = config.s3Bucket;

	if (!bucket) {
		throw new Error("S3_BUCKET must be configured when using S3 storage");
	}

	return {
		async exists(path: string): Promise<boolean> {
			if (isS3Path(path, config)) {
				try {
					await s3Client.send(new HeadObjectCommand({
						Bucket: bucket,
						Key: getS3Key(path)
					}));
					return true;
				} catch {
					return false;
				}
			}
			return realFileSystem.exists(path);
		},

		async readFile(path: string): Promise<Buffer | undefined> {
			if (isS3Path(path, config)) {
				try {
					const response = await s3Client.send(new GetObjectCommand({
						Bucket: bucket,
						Key: getS3Key(path)
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
			return realFileSystem.readFile(path);
		},

		async writeFile(path: string, content: string | Buffer): Promise<void> {
			if (isS3Path(path, config)) {
				try {
					await s3Client.send(new PutObjectCommand({
						Bucket: bucket,
						Key: getS3Key(path),
						Body: content instanceof Buffer ? content : Buffer.from(content)
					}));
				} catch {
					// S3 write failed, operation unsuccessful
				}
				return;
			}
			return realFileSystem.writeFile(path, content);
		},

		async delete(path: string): Promise<boolean> {
			if (isS3Path(path, config)) {
				try {
					await s3Client.send(new DeleteObjectCommand({
						Bucket: bucket,
						Key: getS3Key(path)
					}));
					return true;
				} catch {
					return false;
				}
			}
			return realFileSystem.delete(path);
		}
	};
}

function createS3Client(config: Config): S3Client {
	const s3Config: any = {
		region: config.s3Region || "us-east-1",
	};

	// 如果提供了访问密钥，使用它们
	if (config.s3AccessKeyId && config.s3SecretAccessKey) {
		s3Config.credentials = {
			accessKeyId: config.s3AccessKeyId,
			secretAccessKey: config.s3SecretAccessKey,
		};
	}

	// 如果提供了自定义端点（如 MinIO, R2 等）
	if (config.s3Endpoint) {
		s3Config.endpoint = config.s3Endpoint;
		s3Config.forcePathStyle = config.s3ForcePathStyle;
	}

	return new S3Client(s3Config);
}

function getS3Key(path: string): string {
	// 去掉路径开头的 / 和 s3:// 前缀
	return path.replace(/^(s3:\/\/|\/?)/, "").replace(/^\/+/, "");
}

function isS3Path(path: string, config: Config): boolean {
	// 如果路径以 s3:// 开头，或者全局启用了 S3 存储
	return path.startsWith("s3://") || (config.enableS3Storage && !path.startsWith("/"));
} 