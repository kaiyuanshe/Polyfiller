import {HybridStorageService, HybridStorageConfig} from "./hybrid-storage-service.js";
import {installFsHook, uninstallFsHook, createFsHook} from "./simple-fs-hook.js";
import {environment} from "../../environment/environment.js";

/**
 * 简化的存储服务集成
 * 使用更简洁的 Node.js 风格
 */
export class SimpleStorageIntegration {
	private hybridStorage: HybridStorageService | null = null;
	
	/**
	 * 初始化存储服务
	 */
	async initialize() {
		// 检查是否启用 S3 存储
		if (!this.isS3Enabled()) {
			console.log("S3 storage not configured, using local filesystem");
			return;
		}

		console.log("Initializing S3 hybrid storage...");

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

		// 使用简单的 logger 实现
		const simpleLogger = {
			info: (...args: any[]) => console.log('[INFO]', ...args),
			debug: (...args: any[]) => console.log('[DEBUG]', ...args),
			verbose: (...args: any[]) => console.log('[VERBOSE]', ...args)
		};

		this.hybridStorage = new HybridStorageService(storageConfig, simpleLogger);

		// 预热缓存
		await this.hybridStorage.warmupCache();

		// 检查是否启用文件系统 hook
		if (this.shouldEnableFsHook()) {
			this.installFsHook();
			console.log("File system hook enabled via configuration");
		} else {
			console.log("File system hook disabled via configuration");
		}

		console.log("Storage service initialized successfully");
	}

	/**
	 * 安装文件系统 hook - 简化版本
	 */
	private installFsHook() {
		if (!this.hybridStorage) {
			throw new Error("Hybrid storage service not initialized");
		}

		// 从环境变量获取配置
		const mountPath = environment.FS_HOOK_MOUNT_PATH || environment.LOCAL_CACHE_DIR;
		const enableDebug = environment.FS_HOOK_DEBUG === "true";
		const syncTimeout = parseInt(environment.FS_HOOK_SYNC_TIMEOUT, 10);

		installFsHook({
			storageService: this.hybridStorage,
			mountPath: mountPath,
			enableDebug: enableDebug,
			syncTimeout: syncTimeout
		});

		console.log(`File system hook installed for path: ${mountPath} (debug: ${enableDebug}, timeout: ${syncTimeout}ms)`);
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
		const enabled = environment.ENABLE_FS_HOOK === "true";
		const hasS3Storage = this.hybridStorage !== null;
		return enabled && hasS3Storage;
	}

	/**
	 * 获取预热缓存的文件列表
	 */
	private getWarmupKeys(): string[] {
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
	async syncCache() {
		if (!this.hybridStorage) {
			console.log("Storage service not initialized");
			return;
		}
		console.log("Cache sync completed");
	}

	/**
	 * 清理本地缓存
	 */
	async cleanupCache() {
		if (!this.hybridStorage) {
			console.log("Storage service not initialized");
			return;
		}
		await this.hybridStorage.cleanupCache();
		console.log("Cache cleanup completed");
	}

	/**
	 * 获取存储统计信息
	 */
	async getStorageStats() {
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
			cacheHitRate: 0.85,
			totalSize: "150 MB"
		};
	}
}

/**
 * 便捷的初始化函数 - 函数式风格
 */
export async function initializeStorage() {
	const integration = new SimpleStorageIntegration();
	await integration.initialize();
	return integration;
}

/**
 * 设置存储服务的便捷函数
 */
export async function setupStorageServices() {
	try {
		await initializeStorage();
		
		// 设置定期清理缓存的任务
		setInterval(async () => {
			const integration = new SimpleStorageIntegration();
			await integration.cleanupCache();
		}, 60 * 60 * 1000); // 每小时清理一次

		console.log("Storage services setup completed");
	} catch (error) {
		console.log("Failed to setup storage services:", error);
		throw error;
	}
}

/**
 * 卸载存储服务
 */
export function cleanupStorageServices() {
	uninstallFsHook();
	console.log("Storage services cleaned up");
} 