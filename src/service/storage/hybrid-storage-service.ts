import {IStorageService} from "./i-storage-service.js";
import {S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command} from "@aws-sdk/client-s3";
import {promises as fs} from "fs";
import {join, dirname} from "path";
import {createHash} from "crypto";
import type {ILoggerService} from "../logger/i-logger-service.js";

export interface HybridStorageConfig {
	localCacheDir: string;
	s3Bucket: string;
	s3Endpoint?: string;
	s3Region?: string;
	s3AccessKeyId: string;
	s3SecretAccessKey: string;
	maxCacheSize?: number; // MB
	warmupKeys?: string[];
}

export class HybridStorageService implements IStorageService {
	private readonly s3Client: S3Client;
	private readonly localCacheDir: string;
	private readonly s3Bucket: string;
	private readonly maxCacheSize: number;
	private readonly warmupKeys: string[];
	private readonly logger: ILoggerService;

	constructor(config: HybridStorageConfig, logger: ILoggerService) {
		this.localCacheDir = config.localCacheDir;
		this.s3Bucket = config.s3Bucket;
		this.maxCacheSize = config.maxCacheSize ?? 500; // 默认 500MB
		this.warmupKeys = config.warmupKeys ?? [];
		this.logger = logger;

		// 初始化 S3 客户端
		this.s3Client = new S3Client({
			region: config.s3Region ?? "us-east-1",
			endpoint: config.s3Endpoint,
			credentials: {
				accessKeyId: config.s3AccessKeyId,
				secretAccessKey: config.s3SecretAccessKey
			},
			forcePathStyle: !!config.s3Endpoint // MinIO 需要
		});

		// 确保缓存目录存在
		this.ensureCacheDir();
	}

	private async ensureCacheDir(): Promise<void> {
		try {
			await fs.mkdir(this.localCacheDir, {recursive: true});
		} catch (error) {
			this.logger.error("Failed to create cache directory", error);
		}
	}

	private getLocalPath(key: string): string {
		// 使用 hash 避免文件名冲突和路径问题
		const hash = createHash("sha256").update(key).digest("hex");
		return join(this.localCacheDir, hash.slice(0, 2), hash);
	}

	private async ensureLocalDir(path: string): Promise<void> {
		await fs.mkdir(dirname(path), {recursive: true});
	}

	async readFile(key: string): Promise<Buffer | null> {
		const localPath = this.getLocalPath(key);

		try {
			// 先尝试从本地缓存读取
			const data = await fs.readFile(localPath);
			this.logger.debug(`Cache hit for key: ${key}`);
			return data;
		} catch {
			// 本地缓存不存在，从 S3 读取
			try {
				const command = new GetObjectCommand({
					Bucket: this.s3Bucket,
					Key: key
				});

				const response = await this.s3Client.send(command);
				const data = await this.streamToBuffer(response.Body);

				// 缓存到本地
				await this.ensureLocalDir(localPath);
				await fs.writeFile(localPath, data);

				this.logger.debug(`Downloaded and cached key: ${key}`);
				return data;
			} catch (error) {
				this.logger.warn(`Failed to read key ${key}:`, error);
				return null;
			}
		}
	}

	async writeFile(key: string, data: Buffer): Promise<void> {
		const localPath = this.getLocalPath(key);

		try {
			// 写入本地缓存
			await this.ensureLocalDir(localPath);
			await fs.writeFile(localPath, data);

			// 异步上传到 S3
			const command = new PutObjectCommand({
				Bucket: this.s3Bucket,
				Key: key,
				Body: data
			});

			await this.s3Client.send(command);
			this.logger.debug(`Uploaded key: ${key}`);
		} catch (error) {
			this.logger.error(`Failed to write key ${key}:`, error);
			throw error;
		}
	}

	async exists(key: string): Promise<boolean> {
		const localPath = this.getLocalPath(key);

		try {
			// 先检查本地缓存
			await fs.access(localPath);
			return true;
		} catch {
			// 检查 S3
			try {
				const command = new HeadObjectCommand({
					Bucket: this.s3Bucket,
					Key: key
				});

				await this.s3Client.send(command);
				return true;
			} catch {
				return false;
			}
		}
	}

	async deleteFile(key: string): Promise<void> {
		const localPath = this.getLocalPath(key);

		try {
			// 删除本地缓存
			await fs.unlink(localPath);
		} catch {
			// 忽略本地文件不存在的错误
		}

		try {
			// 删除 S3 文件
			const command = new DeleteObjectCommand({
				Bucket: this.s3Bucket,
				Key: key
			});

			await this.s3Client.send(command);
			this.logger.debug(`Deleted key: ${key}`);
		} catch (error) {
			this.logger.error(`Failed to delete key ${key}:`, error);
			throw error;
		}
	}

	async listFiles(prefix?: string): Promise<string[]> {
		try {
			const command = new ListObjectsV2Command({
				Bucket: this.s3Bucket,
				Prefix: prefix
			});

			const response = await this.s3Client.send(command);
			return response.Contents?.map(obj => obj.Key!).filter(Boolean) ?? [];
		} catch (error) {
			this.logger.error("Failed to list files:", error);
			return [];
		}
	}

	async warmupCache(): Promise<void> {
		this.logger.info("Starting cache warmup...");
		
		const keys = this.warmupKeys.length > 0 ? this.warmupKeys : await this.getPopularKeys();

		const promises = keys.map(async key => {
			try {
				await this.readFile(key);
				this.logger.debug(`Warmed up key: ${key}`);
			} catch (error) {
				this.logger.warn(`Failed to warm up key ${key}:`, error);
			}
		});

		await Promise.allSettled(promises);
		this.logger.info(`Cache warmup completed. Processed ${keys.length} keys.`);
	}

	private async getPopularKeys(): Promise<string[]> {
		// 获取最常用的文件列表
		// 可以根据业务逻辑实现，比如获取最新的几个 polyfill 文件
		const allKeys = await this.listFiles();
		return allKeys.slice(0, 100); // 返回前100个文件
	}

	private async streamToBuffer(stream: any): Promise<Buffer> {
		const chunks: Buffer[] = [];
		
		return new Promise((resolve, reject) => {
			stream.on("data", (chunk: Buffer) => chunks.push(chunk));
			stream.on("error", reject);
			stream.on("end", () => resolve(Buffer.concat(chunks)));
		});
	}

	// 清理缓存的方法
	async cleanupCache(): Promise<void> {
		try {
			const stats = await this.getCacheStats();
			if (stats.totalSize > this.maxCacheSize * 1024 * 1024) {
				await this.evictOldFiles();
			}
		} catch (error) {
			this.logger.error("Failed to cleanup cache:", error);
		}
	}

	private async getCacheStats(): Promise<{totalSize: number; fileCount: number}> {
		// 实现缓存统计逻辑
		// 返回缓存总大小和文件数量
		return {totalSize: 0, fileCount: 0};
	}

	private async evictOldFiles(): Promise<void> {
		// 实现 LRU 缓存清理逻辑
		// 删除最旧的文件直到缓存大小低于阈值
	}
} 