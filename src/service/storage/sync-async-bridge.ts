/**
 * 优化的同步异步桥接工具
 * 使用 SharedArrayBuffer 和 Atomics 实现高效的同步等待
 */

export class SyncAsyncBridge {
	private static readonly TIMEOUT_STATUS = 0;
	private static readonly SUCCESS_STATUS = 1;
	private static readonly ERROR_STATUS = 2;

	/**
	 * 将异步操作转换为同步操作
	 * 使用 SharedArrayBuffer 和 Atomics 实现高效等待
	 */
	static toSync<T>(asyncFn: () => Promise<T>, timeoutMs: number = 5000): T {
		// 检查是否支持 SharedArrayBuffer
		if (typeof SharedArrayBuffer === 'undefined' || typeof Atomics === 'undefined') {
			return this.toSyncFallback(asyncFn, timeoutMs);
		}

		const sharedBuffer = new SharedArrayBuffer(1024);
		const statusArray = new Int32Array(sharedBuffer, 0, 1);
		const dataArray = new Int32Array(sharedBuffer, 4);

		let result: T;
		let error: Error;

		// 设置初始状态
		Atomics.store(statusArray, 0, this.TIMEOUT_STATUS);

		// 执行异步操作
		asyncFn()
			.then((res) => {
				result = res;
				Atomics.store(statusArray, 0, this.SUCCESS_STATUS);
				Atomics.notify(statusArray, 0);
			})
			.catch((err) => {
				error = err;
				Atomics.store(statusArray, 0, this.ERROR_STATUS);
				Atomics.notify(statusArray, 0);
			});

		// 等待操作完成
		const waitResult = Atomics.wait(statusArray, 0, this.TIMEOUT_STATUS, timeoutMs);

		if (waitResult === 'timed-out') {
			throw new Error(`Sync operation timeout after ${timeoutMs}ms`);
		}

		const finalStatus = Atomics.load(statusArray, 0);
		
		if (finalStatus === this.ERROR_STATUS) {
			throw error!;
		}

		if (finalStatus === this.SUCCESS_STATUS) {
			return result!;
		}

		throw new Error('Unexpected sync operation state');
	}

	/**
	 * 降级方案：使用改进的事件循环等待
	 */
	private static toSyncFallback<T>(asyncFn: () => Promise<T>, timeoutMs: number): T {
		let result: T | undefined;
		let error: Error | undefined;
		let completed = false;

		// 执行异步操作
		asyncFn()
			.then((res) => {
				result = res;
				completed = true;
			})
			.catch((err) => {
				error = err;
				completed = true;
			});

		// 使用 setImmediate 让出控制权，比忙等待更高效
		const startTime = Date.now();
		while (!completed && Date.now() - startTime < timeoutMs) {
			// 使用更高效的等待方式
			require('child_process').spawnSync('node', ['-e', 'setTimeout(() => {}, 1)'], {
				timeout: 1,
				stdio: 'ignore'
			});
		}

		if (!completed) {
			throw new Error(`Sync operation timeout after ${timeoutMs}ms`);
		}

		if (error) {
			throw error;
		}

		return result!;
	}

	/**
	 * 创建带缓存的同步函数
	 */
	static createCachedSyncFunction<T extends any[], R>(
		asyncFn: (...args: T) => Promise<R>,
		options: {
			timeout?: number;
			cacheSize?: number;
			keyGenerator?: (...args: T) => string;
		} = {}
	): (...args: T) => R {
		const cache = new Map<string, {result: R; timestamp: number}>();
		const timeout = options.timeout ?? 5000;
		const cacheSize = options.cacheSize ?? 100;
		const keyGenerator = options.keyGenerator ?? ((...args) => JSON.stringify(args));

		return (...args: T): R => {
			const key = keyGenerator(...args);
			const cached = cache.get(key);

			// 简单的时间基础缓存失效（5分钟）
			if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
				return cached.result;
			}

			const result = this.toSync(() => asyncFn(...args), timeout);

			// 管理缓存大小
			if (cache.size >= cacheSize) {
				const firstKey = cache.keys().next().value;
				cache.delete(firstKey);
			}

			cache.set(key, {result, timestamp: Date.now()});
			return result;
		};
	}
}

/**
 * 快捷方法
 */
export function asyncToSync<T>(asyncFn: () => Promise<T>, timeoutMs?: number): T {
	return SyncAsyncBridge.toSync(asyncFn, timeoutMs);
}

export function createSyncFunction<T extends any[], R>(
	asyncFn: (...args: T) => Promise<R>,
	options?: {timeout?: number; cacheSize?: number}
): (...args: T) => R {
	return SyncAsyncBridge.createCachedSyncFunction(asyncFn, options);
} 