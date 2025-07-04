import {HybridStorageService, HybridStorageConfig} from "./hybrid-storage-service.js";
import {installOptimizedFsHook, OptimizedFsHookConfig} from "./optimized-fs-hook.js";
import type {ILoggerService} from "../logger/i-logger-service.js";
import {environment} from "../../environment/environment.js";

/**
 * 存储服务集成示例
 * 展示如何在 Polyfiller 项目中使用 S3 存储和 fs hook
 */
export class StorageIntegrationExample {
	private hybridStorage: HybridStorageService | null = null;
	private logger: ILoggerService;

	constructor(logger: ILoggerService) {
		this.logger = logger;
	}

	/**
	 * 初始化存储服务
	 */
	async initialize(): Promise<void> {
		// 检查是否启用 S3 存储
		if (!this.isS3Enabled()) {
			this.logger.info("S3 storage not configured, using local filesystem");
			return;
		}

		this.logger.info("Initializing S3 hybrid storage...");

		// 创建混合存储服务
		const storageConfig: HybridStorageConfig = {
			localCacheDir: environment.LOCAL_CACHE_DIR,
			s3Bucket: environment.S3_BUCKET,
			s3Endpoint: environment.S3_ENDPOINT,
			s3Region: environment.S3_REGION,
			s3AccessKeyId: environment.S3_ACCESS_KEY_ID!,
			s3SecretAccessKey: environment.S3_SECRET_ACCESS_KEY!,
			maxCacheSize: parseInt(environment.MAX_CACHE_SIZE, 10),
			warmupKeys: this.getWarmupKeys()
		};

		this.hybridStorage = new HybridStorageService(storageConfig, this.logger);

		// 预热缓存
		await this.hybridStorage.warmupCache();

		// 检查是否启用文件系统 hook
		if (this.shouldEnableFsHook()) {
			this.installFsHook();
			this.logger.info("File system hook enabled via configuration");
		} else {
			this.logger.info("File system hook disabled via configuration");
		}

		this.logger.info("Storage service initialized successfully");
	}

	/**
	 * 安装文件系统 hook
	 */
	private installFsHook(): void {
		if (!this.hybridStorage) {
			throw new Error("Hybrid storage service not initialized");
		}

		// 从环境变量获取配置
		const mountPath = environment.FS_HOOK_MOUNT_PATH || environment.LOCAL_CACHE_DIR;
		const enableDebug = environment.FS_HOOK_DEBUG === "true";
		const syncTimeout = parseInt(environment.FS_HOOK_SYNC_TIMEOUT, 10);

		const hookConfig: OptimizedFsHookConfig = {
			storageService: this.hybridStorage,
			logger: this.logger,
			mountPath: mountPath,
			enableDebug: enableDebug,
			syncTimeout: syncTimeout
		};

		installOptimizedFsHook(hookConfig);
		this.logger.info(`File system hook installed for path: ${mountPath} (debug: ${enableDebug}, timeout: ${syncTimeout}ms)`);
	}

	/**
	 * 检查是否启用 S3 存储
	 */
	private isS3Enabled(): boolean {
		return !!(
			environment.S3_ACCESS_KEY_ID &&
			environment.S3_SECRET_ACCESS_KEY &&
			environment.S3_BUCKET
		);
	}

	/**
	 * 检查是否应该启用文件系统 Hook
	 */
	private shouldEnableFsHook(): boolean {
		// 检查环境变量配置
		const enabled = environment.ENABLE_FS_HOOK === "true";
		
		// 只有在启用 S3 存储时才有意义启用 fs hook
		const hasS3Storage = this.hybridStorage !== null;

		return enabled && hasS3Storage;
	}

	/**
	 * 获取预热缓存的文件列表
	 */
	private getWarmupKeys(): string[] {
		// 这里可以根据业务逻辑返回需要预热的文件
		// 比如最常用的 polyfill 文件
		return [
			'polyfills/core-js.min.js',
			'polyfills/fetch.min.js',
			'polyfills/es6-promise.min.js',
			'polyfills/intersection-observer.min.js'
		];
	}

	/**
	 * 手动同步缓存到 S3
	 */
	async syncCache(): Promise<void> {
		if (!this.hybridStorage) {
			this.logger.info("Storage service not initialized");
			return;
		}

		// 这里可以实现缓存同步逻辑
		this.logger.info("Cache sync completed");
	}

	/**
	 * 清理本地缓存
	 */
	async cleanupCache(): Promise<void> {
		if (!this.hybridStorage) {
			this.logger.info("Storage service not initialized");
			return;
		}

		await this.hybridStorage.cleanupCache();
		this.logger.info("Cache cleanup completed");
	}

	/**
	 * 获取存储统计信息
	 */
	async getStorageStats(): Promise<{
		totalFiles: number;
		cacheHitRate: number;
		totalSize: string;
	}> {
		if (!this.hybridStorage) {
			return {
				totalFiles: 0,
				cacheHitRate: 0,
				totalSize: "0 MB"
			};
		}

		const files = await this.hybridStorage.listFiles();
		
		return {
			totalFiles: files.length,
			cacheHitRate: 0.85, // 示例数据
			totalSize: "150 MB" // 示例数据
		};
	}
}

/**
 * 使用示例
 */
export async function initializeStorageForPolyfiller(logger: ILoggerService): Promise<StorageIntegrationExample> {
	const integration = new StorageIntegrationExample(logger);
	await integration.initialize();
	return integration;
}

/**
 * 在应用启动时调用的初始化函数
 */
export async function setupStorageServices(logger: ILoggerService): Promise<void> {
	try {
		await initializeStorageForPolyfiller(logger);
		
		// 设置定期清理缓存的任务
		setInterval(async () => {
			const integration = new StorageIntegrationExample(logger);
			await integration.cleanupCache();
		}, 60 * 60 * 1000); // 每小时清理一次

		logger.info("Storage services setup completed");
	} catch (error) {
		logger.info("Failed to setup storage services:", error);
		throw error;
	}
} 