import * as fs from "fs";
import * as path from "path";
import {IStorageService} from "./i-storage-service.js";
import type {ILoggerService} from "../logger/i-logger-service.js";

export interface FsHookConfig {
	storageService: IStorageService;
	logger: ILoggerService;
	mountPath: string; // 要 hook 的路径前缀，如 "/tmp/@wessberg/polyfiller"
	enableDebug?: boolean;
}

export class FsHook {
	private readonly storageService: IStorageService;
	private readonly logger: ILoggerService;
	private readonly mountPath: string;
	private readonly enableDebug: boolean;
	private readonly originalFs: {[key: string]: any} = {};
	private isInstalled = false;

	constructor(config: FsHookConfig) {
		this.storageService = config.storageService;
		this.logger = config.logger;
		this.mountPath = config.mountPath;
		this.enableDebug = config.enableDebug ?? false;
	}

	/**
	 * 安装 fs hook
	 */
	install(): void {
		if (this.isInstalled) {
			this.logger.warn("FsHook is already installed");
			return;
		}

		this.logger.info(`Installing FsHook for mount path: ${this.mountPath}`);

		// 备份原始方法
		this.backupOriginalMethods();

		// Hook 同步方法
		this.hookSyncMethods();

		// Hook 异步方法
		this.hookAsyncMethods();

		// Hook promise 方法
		this.hookPromiseMethods();

		this.isInstalled = true;
		this.logger.info("FsHook installed successfully");
	}

	/**
	 * 卸载 fs hook
	 */
	uninstall(): void {
		if (!this.isInstalled) {
			return;
		}

		this.logger.info("Uninstalling FsHook");

		// 恢复原始方法
		for (const [methodName, originalMethod] of Object.entries(this.originalFs)) {
			(fs as any)[methodName] = originalMethod;
		}

		this.isInstalled = false;
		this.logger.info("FsHook uninstalled successfully");
	}

	private backupOriginalMethods(): void {
		const methodsToBackup = [
			'readFile', 'readFileSync', 'writeFile', 'writeFileSync',
			'access', 'accessSync', 'stat', 'statSync', 'lstat', 'lstatSync',
			'readdir', 'readdirSync', 'mkdir', 'mkdirSync', 'unlink', 'unlinkSync',
			'open', 'openSync', 'close', 'closeSync', 'read', 'readSync',
			'write', 'writeSync', 'exists', 'existsSync'
		];

		for (const methodName of methodsToBackup) {
			if (fs.hasOwnProperty(methodName)) {
				this.originalFs[methodName] = (fs as any)[methodName].bind(fs);
			}
		}

		// 备份 fs.promises 方法
		if (fs.promises) {
			this.originalFs.promises = {...fs.promises};
		}
	}

	private shouldIntercept(filePath: string): boolean {
		const normalizedPath = path.normalize(filePath);
		const normalizedMount = path.normalize(this.mountPath);
		return normalizedPath.startsWith(normalizedMount);
	}

	private getStorageKey(filePath: string): string {
		const normalizedPath = path.normalize(filePath);
		const normalizedMount = path.normalize(this.mountPath);
		return normalizedPath.substring(normalizedMount.length + 1).replace(/\\/g, '/');
	}

	private debug(message: string, ...args: any[]): void {
		if (this.enableDebug) {
			this.logger.debug(`[FsHook] ${message}`, ...args);
		}
	}

	private hookSyncMethods(): void {
		// Hook readFileSync
		const originalReadFileSync = this.originalFs.readFileSync;
		(fs as any).readFileSync = (filePath: string, options?: any) => {
			if (this.shouldIntercept(filePath)) {
				this.debug(`Intercepting readFileSync: ${filePath}`);
				const key = this.getStorageKey(filePath);
				
				// 同步版本需要转换为异步调用
				let result: Buffer | null = null;
				let error: Error | null = null;
				
				this.storageService.readFile(key).then(data => {
					result = data;
				}).catch(err => {
					error = err;
				});

				// 简单的忙等待（不推荐在生产环境使用）
				const start = Date.now();
				while (result === null && error === null && Date.now() - start < 5000) {
					// 等待异步操作完成
				}

				if (error) throw error;
				if (!result) throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);

				if (options && typeof options === 'object' && options.encoding) {
					return result.toString(options.encoding);
				}
				return result;
			}
			return originalReadFileSync(filePath, options);
		};

		// Hook writeFileSync
		const originalWriteFileSync = this.originalFs.writeFileSync;
		(fs as any).writeFileSync = (filePath: string, data: any, options?: any) => {
			if (this.shouldIntercept(filePath)) {
				this.debug(`Intercepting writeFileSync: ${filePath}`);
				const key = this.getStorageKey(filePath);
				const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
				
				let error: Error | null = null;
				this.storageService.writeFile(key, buffer).catch(err => {
					error = err;
				});

				const start = Date.now();
				while (error === null && Date.now() - start < 5000) {
					// 等待异步操作完成
				}

				if (error) throw error;
				return;
			}
			return originalWriteFileSync(filePath, data, options);
		};

		// Hook existsSync
		const originalExistsSync = this.originalFs.existsSync;
		(fs as any).existsSync = (filePath: string) => {
			if (this.shouldIntercept(filePath)) {
				this.debug(`Intercepting existsSync: ${filePath}`);
				const key = this.getStorageKey(filePath);
				
				let result = false;
				this.storageService.exists(key).then(exists => {
					result = exists;
				}).catch(() => {
					result = false;
				});

				const start = Date.now();
				while (result === false && Date.now() - start < 1000) {
					// 等待异步操作完成
				}

				return result;
			}
			return originalExistsSync(filePath);
		};

		// Hook statSync
		const originalStatSync = this.originalFs.statSync;
		(fs as any).statSync = (filePath: string, options?: any) => {
			if (this.shouldIntercept(filePath)) {
				this.debug(`Intercepting statSync: ${filePath}`);
				const key = this.getStorageKey(filePath);
				
				let exists = false;
				this.storageService.exists(key).then(result => {
					exists = result;
				}).catch(() => {
					exists = false;
				});

				const start = Date.now();
				while (!exists && Date.now() - start < 1000) {
					// 等待异步操作完成
				}

				if (!exists) {
					throw new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
				}

				// 返回模拟的 stat 对象
				return {
					isFile: () => true,
					isDirectory: () => false,
					isBlockDevice: () => false,
					isCharacterDevice: () => false,
					isSymbolicLink: () => false,
					isFIFO: () => false,
					isSocket: () => false,
					size: 0, // 实际大小需要从存储服务获取
					mtime: new Date(),
					ctime: new Date(),
					atime: new Date(),
					birthtime: new Date()
				};
			}
			return originalStatSync(filePath, options);
		};
	}

	private hookAsyncMethods(): void {
		// Hook readFile
		const originalReadFile = this.originalFs.readFile;
		(fs as any).readFile = (filePath: string, options: any, callback?: Function) => {
			// 处理参数重载
			if (typeof options === 'function') {
				callback = options;
				options = undefined;
			}

			if (this.shouldIntercept(filePath)) {
				this.debug(`Intercepting readFile: ${filePath}`);
				const key = this.getStorageKey(filePath);
				
				this.storageService.readFile(key).then(data => {
					if (!data) {
						const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as any;
						error.code = 'ENOENT';
						error.errno = -2;
						error.path = filePath;
						return callback!(error);
					}

					if (options && typeof options === 'object' && options.encoding) {
						return callback!(null, data.toString(options.encoding));
					}
					callback!(null, data);
				}).catch(callback!);
				return;
			}
			return originalReadFile(filePath, options, callback!);
		};

		// Hook writeFile
		const originalWriteFile = this.originalFs.writeFile;
		(fs as any).writeFile = (filePath: string, data: any, options: any, callback?: Function) => {
			if (typeof options === 'function') {
				callback = options;
				options = undefined;
			}

			if (this.shouldIntercept(filePath)) {
				this.debug(`Intercepting writeFile: ${filePath}`);
				const key = this.getStorageKey(filePath);
				const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
				
				this.storageService.writeFile(key, buffer).then(() => {
					callback!(null);
				}).catch(callback!);
				return;
			}
			return originalWriteFile(filePath, data, options, callback!);
		};

		// Hook access
		const originalAccess = this.originalFs.access;
		(fs as any).access = (filePath: string, mode: number, callback?: Function) => {
			if (typeof mode === 'function') {
				callback = mode;
				mode = fs.constants.F_OK;
			}

			if (this.shouldIntercept(filePath)) {
				this.debug(`Intercepting access: ${filePath}`);
				const key = this.getStorageKey(filePath);
				
				this.storageService.exists(key).then(exists => {
					if (!exists) {
						const error = new Error(`ENOENT: no such file or directory, access '${filePath}'`) as any;
						error.code = 'ENOENT';
						error.errno = -2;
						error.path = filePath;
						return callback!(error);
					}
					callback!(null);
				}).catch(callback!);
				return;
			}
			return originalAccess(filePath, mode, callback!);
		};
	}

	private hookPromiseMethods(): void {
		if (!fs.promises) return;

		const originalPromises = this.originalFs.promises;

		// Hook fs.promises.readFile
		(fs.promises as any).readFile = async (filePath: string, options?: any) => {
			if (this.shouldIntercept(filePath)) {
				this.debug(`Intercepting promises.readFile: ${filePath}`);
				const key = this.getStorageKey(filePath);
				
				const data = await this.storageService.readFile(key);
				if (!data) {
					const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as any;
					error.code = 'ENOENT';
					error.errno = -2;
					error.path = filePath;
					throw error;
				}

				if (options && typeof options === 'object' && options.encoding) {
					return data.toString(options.encoding);
				}
				return data;
			}
			return originalPromises.readFile(filePath, options);
		};

		// Hook fs.promises.writeFile
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

		// Hook fs.promises.access
		(fs.promises as any).access = async (filePath: string, mode?: number) => {
			if (this.shouldIntercept(filePath)) {
				this.debug(`Intercepting promises.access: ${filePath}`);
				const key = this.getStorageKey(filePath);
				
				const exists = await this.storageService.exists(key);
				if (!exists) {
					const error = new Error(`ENOENT: no such file or directory, access '${filePath}'`) as any;
					error.code = 'ENOENT';
					error.errno = -2;
					error.path = filePath;
					throw error;
				}
				return;
			}
			return originalPromises.access(filePath, mode);
		};

		// Hook fs.promises.stat
		(fs.promises as any).stat = async (filePath: string, options?: any) => {
			if (this.shouldIntercept(filePath)) {
				this.debug(`Intercepting promises.stat: ${filePath}`);
				const key = this.getStorageKey(filePath);
				
				const exists = await this.storageService.exists(key);
				if (!exists) {
					const error = new Error(`ENOENT: no such file or directory, stat '${filePath}'`) as any;
					error.code = 'ENOENT';
					error.errno = -2;
					error.path = filePath;
					throw error;
				}

				return {
					isFile: () => true,
					isDirectory: () => false,
					isBlockDevice: () => false,
					isCharacterDevice: () => false,
					isSymbolicLink: () => false,
					isFIFO: () => false,
					isSocket: () => false,
					size: 0,
					mtime: new Date(),
					ctime: new Date(),
					atime: new Date(),
					birthtime: new Date()
				};
			}
			return originalPromises.stat(filePath, options);
		};
	}
}

// 全局单例
let globalFsHook: FsHook | null = null;

export function installFsHook(config: FsHookConfig): void {
	if (globalFsHook) {
		globalFsHook.uninstall();
	}
	globalFsHook = new FsHook(config);
	globalFsHook.install();
}

export function uninstallFsHook(): void {
	if (globalFsHook) {
		globalFsHook.uninstall();
		globalFsHook = null;
	}
} 