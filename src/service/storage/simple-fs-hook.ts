import * as fs from "fs";
import * as path from "path";
import {IStorageService} from "./i-storage-service.js";
import {asyncToSync, createSyncFunction} from "./sync-async-bridge.js";

export interface SimpleFsHookConfig {
	storageService: IStorageService;
	mountPath: string;
	enableDebug?: boolean;
	syncTimeout?: number;
}

/**
 * 简洁的文件系统 Hook 实现
 * 使用更通用的 Node.js 风格
 */
export class SimpleFsHook {
	private storageService: IStorageService;
	private mountPath: string;
	private enableDebug: boolean;
	private syncTimeout: number;
	private originalFs = new Map<string, any>();
	private isInstalled = false;

	// 缓存的同步函数
	private cachedReadFile: (key: string) => Buffer | null;
	private cachedExists: (key: string) => boolean;

	constructor(config: SimpleFsHookConfig) {
		this.storageService = config.storageService;
		this.mountPath = config.mountPath;
		this.enableDebug = config.enableDebug ?? false;
		this.syncTimeout = config.syncTimeout ?? 5000;

		// 创建缓存的同步函数
		this.cachedReadFile = createSyncFunction(
			(key: string) => this.storageService.readFile(key),
			{timeout: this.syncTimeout, cacheSize: 50}
		);

		this.cachedExists = createSyncFunction(
			(key: string) => this.storageService.exists(key),
			{timeout: this.syncTimeout, cacheSize: 100}
		);
	}

	install() {
		if (this.isInstalled) {
			console.log("SimpleFsHook is already installed");
			return;
		}

		console.log(`Installing SimpleFsHook for mount path: ${this.mountPath}`);
		this.backupAndHookMethods();
		this.isInstalled = true;
		console.log("SimpleFsHook installed successfully");
	}

	uninstall() {
		if (!this.isInstalled) return;
		console.log("Uninstalling SimpleFsHook");
		this.restoreOriginalMethods();
		this.isInstalled = false;
		console.log("SimpleFsHook uninstalled successfully");
	}

	private backupAndHookMethods() {
		const methods = ['readFileSync', 'writeFileSync', 'existsSync', 'readFile', 'writeFile'];

		methods.forEach(method => {
			if ((fs as any)[method]) {
				this.originalFs.set(method, (fs as any)[method].bind(fs));
				(fs as any)[method] = this.createHookedMethod(method);
			}
		});

		if (fs.promises) {
			this.originalFs.set('promises', {...fs.promises});
			this.hookPromiseMethods();
		}
	}

	private restoreOriginalMethods() {
		this.originalFs.forEach((originalMethod, methodName) => {
			if (methodName === 'promises') {
				Object.assign(fs.promises, originalMethod);
			} else {
				(fs as any)[methodName] = originalMethod;
			}
		});
		this.originalFs.clear();
	}

	private shouldIntercept(filePath: string): boolean {
		const normalizedPath = path.resolve(filePath);
		const normalizedMount = path.resolve(this.mountPath);
		return normalizedPath.startsWith(normalizedMount);
	}

	private getStorageKey(filePath: string): string {
		const normalizedPath = path.resolve(filePath);
		const normalizedMount = path.resolve(this.mountPath);
		return normalizedPath.substring(normalizedMount.length + 1).replace(/\\/g, '/');
	}

	private debug(message: string) {
		if (this.enableDebug) {
			console.log(`[SimpleFsHook] ${message}`);
		}
	}

	private createHookedMethod(methodName: string): Function {
		const originalMethod = this.originalFs.get(methodName)!;

		switch (methodName) {
			case 'readFileSync':
				return (filePath: string, options?: any) => {
					if (this.shouldIntercept(filePath)) {
						this.debug(`Intercepting ${methodName}: ${filePath}`);
						const key = this.getStorageKey(filePath);
						const data = this.cachedReadFile(key);
						if (!data) {
							const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as any;
							error.code = 'ENOENT';
							throw error;
						}
						if (options && typeof options === 'object' && options.encoding) {
							return data.toString(options.encoding);
						}
						return data;
					}
					return originalMethod(filePath, options);
				};

			case 'writeFileSync':
				return (filePath: string, data: any, options?: any) => {
					if (this.shouldIntercept(filePath)) {
						this.debug(`Intercepting ${methodName}: ${filePath}`);
						const key = this.getStorageKey(filePath);
						const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
						asyncToSync(() => this.storageService.writeFile(key, buffer), this.syncTimeout);
						return;
					}
					return originalMethod(filePath, data, options);
				};

			case 'existsSync':
				return (filePath: string) => {
					if (this.shouldIntercept(filePath)) {
						this.debug(`Intercepting ${methodName}: ${filePath}`);
						const key = this.getStorageKey(filePath);
						return this.cachedExists(key);
					}
					return originalMethod(filePath);
				};

			case 'readFile':
				return (filePath: string, options: any, callback?: Function) => {
					if (typeof options === 'function') {
						callback = options;
						options = undefined;
					}

					if (this.shouldIntercept(filePath)) {
						this.debug(`Intercepting ${methodName}: ${filePath}`);
						const key = this.getStorageKey(filePath);
						
						this.storageService.readFile(key).then(data => {
							if (!data) {
								const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as any;
								error.code = 'ENOENT';
								return callback!(error);
							}
							if (options && typeof options === 'object' && options.encoding) {
								return callback!(null, data.toString(options.encoding));
							}
							callback!(null, data);
						}).catch((error: Error) => callback!(error));
						return;
					}
					return originalMethod(filePath, options, callback!);
				};

			default:
				return originalMethod;
		}
	}

	private hookPromiseMethods() {
		if (!fs.promises) return;

		const originalPromises = this.originalFs.get('promises')!;

		(fs.promises as any).readFile = async (filePath: string, options?: any) => {
			if (this.shouldIntercept(filePath)) {
				this.debug(`Intercepting promises.readFile: ${filePath}`);
				const key = this.getStorageKey(filePath);
				const data = await this.storageService.readFile(key);
				if (!data) {
					const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as any;
					error.code = 'ENOENT';
					throw error;
				}
				if (options && typeof options === 'object' && options.encoding) {
					return data.toString(options.encoding);
				}
				return data;
			}
			return originalPromises.readFile(filePath, options);
		};

		(fs.promises as any).writeFile = async (filePath: string, data: any, options?: any) => {
			if (this.shouldIntercept(filePath)) {
				this.debug(`Intercepting promises.writeFile: ${filePath}`);
				const key = this.getStorageKey(filePath);
				const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
				await this.storageService.writeFile(key, buffer);
				return;
			}
			return originalPromises.writeFile(filePath, data, options);
		};
	}
}

// 全局实例管理 - 简化版本
let globalFsHook: SimpleFsHook | null = null;

export function installFsHook(config: SimpleFsHookConfig) {
	if (globalFsHook) {
		globalFsHook.uninstall();
	}
	globalFsHook = new SimpleFsHook(config);
	globalFsHook.install();
}

export function uninstallFsHook() {
	if (globalFsHook) {
		globalFsHook.uninstall();
		globalFsHook = null;
	}
}

// 便捷工厂函数
export function createFsHook(storageService: IStorageService, mountPath: string, options?: {
	enableDebug?: boolean;
	syncTimeout?: number;
}) {
	return new SimpleFsHook({
		storageService,
		mountPath,
		enableDebug: options?.enableDebug ?? false,
		syncTimeout: options?.syncTimeout ?? 5000
	});
} 