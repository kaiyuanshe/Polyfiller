import * as fs from "fs";
import * as path from "path";
import {IStorageService} from "./i-storage-service.js";
import type {ILoggerService} from "../logger/i-logger-service.js";
import {asyncToSync} from "./sync-async-bridge.js";

export interface AdvancedFsHookConfig {
	storageService: IStorageService;
	logger: ILoggerService;
	mountPath: string;
	enableDebug?: boolean;
	syncTimeout?: number; // 同步操作超时时间（毫秒）
}

/**
 * 高性能的文件系统 Hook，使用更优雅的异步转同步方案
 */
export class AdvancedFsHook {
	private readonly storageService: IStorageService;
	private readonly logger: ILoggerService;
	private readonly mountPath: string;
	private readonly enableDebug: boolean;
	private readonly syncTimeout: number;
	private readonly originalFs: Map<string, any> = new Map();
	private isInstalled = false;

	// 文件描述符缓存
	private readonly fdCache = new Map<number, {key: string; position: number; flags: string}>();
	private fdCounter = 1000; // 从 1000 开始避免与系统 fd 冲突

	constructor(config: AdvancedFsHookConfig) {
		this.storageService = config.storageService;
		this.logger = config.logger;
		this.mountPath = config.mountPath;
		this.enableDebug = config.enableDebug ?? false;
		this.syncTimeout = config.syncTimeout ?? 5000;
	}

	install(): void {
		if (this.isInstalled) {
			this.logger.info("AdvancedFsHook is already installed");
			return;
		}

		this.logger.info(`Installing AdvancedFsHook for mount path: ${this.mountPath}`);
		this.backupAndHookMethods();
		this.isInstalled = true;
		this.logger.info("AdvancedFsHook installed successfully");
	}

	uninstall(): void {
		if (!this.isInstalled) return;

		this.logger.info("Uninstalling AdvancedFsHook");
		this.restoreOriginalMethods();
		this.fdCache.clear();
		this.isInstalled = false;
		this.logger.info("AdvancedFsHook uninstalled successfully");
	}

	private backupAndHookMethods(): void {
		// 需要 hook 的方法列表
		const methods = [
			// 同步方法
			'readFileSync', 'writeFileSync', 'existsSync', 'statSync', 'lstatSync',
			'accessSync', 'mkdirSync', 'unlinkSync', 'readdirSync',
			'openSync', 'closeSync', 'readSync', 'writeSync',
			
			// 异步方法
			'readFile', 'writeFile', 'exists', 'stat', 'lstat',
			'access', 'mkdir', 'unlink', 'readdir',
			'open', 'close', 'read', 'write'
		];

		methods.forEach(method => {
			if ((fs as any)[method]) {
				this.originalFs.set(method, (fs as any)[method].bind(fs));
				(fs as any)[method] = this.createHookedMethod(method);
			}
		});

		// Hook fs.promises
		if (fs.promises) {
			this.originalFs.set('promises', {...fs.promises});
			this.hookPromiseMethods();
		}
	}

	private restoreOriginalMethods(): void {
		this.originalFs.forEach((originalMethod, methodName) => {
			if (methodName === 'promises') {
				// 恢复 fs.promises
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

	private debug(message: string, ...args: any[]): void {
		if (this.enableDebug) {
			this.logger.debug(`[AdvancedFsHook] ${message}`, ...args);
		}
	}

	/**
	 * 异步转同步的核心方法 - 使用优化的同步桥接工具
	 */
	private performSyncOperation<T>(asyncFn: () => Promise<T>): T {
		return asyncToSync(asyncFn, this.syncTimeout);
	}

	private createHookedMethod(methodName: string): Function {
		const originalMethod = this.originalFs.get(methodName)!;

		switch (methodName) {
			case 'readFileSync':
				return (filePath: string, options?: any) => {
					if (this.shouldIntercept(filePath)) {
						this.debug(`Intercepting ${methodName}: ${filePath}`);
						const key = this.getStorageKey(filePath);
						
						const data = this.performSyncOperation(() => this.storageService.readFile(key));
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
						
						this.performSyncOperation(() => this.storageService.writeFile(key, buffer));
						return;
					}
					return originalMethod(filePath, data, options);
				};

			case 'existsSync':
				return (filePath: string) => {
					if (this.shouldIntercept(filePath)) {
						this.debug(`Intercepting ${methodName}: ${filePath}`);
						const key = this.getStorageKey(filePath);
						return this.performSyncOperation(() => this.storageService.exists(key));
					}
					return originalMethod(filePath);
				};

			case 'statSync':
			case 'lstatSync':
				return (filePath: string, options?: any) => {
					if (this.shouldIntercept(filePath)) {
						this.debug(`Intercepting ${methodName}: ${filePath}`);
						const key = this.getStorageKey(filePath);
						
						const exists = this.performSyncOperation(() => this.storageService.exists(key));
						if (!exists) {
							const error = new Error(`ENOENT: no such file or directory, stat '${filePath}'`) as any;
							error.code = 'ENOENT';
							throw error;
						}

						return this.createMockStats();
					}
					return originalMethod(filePath, options);
				};

			case 'openSync':
				return (filePath: string, flags: string = 'r', mode?: any) => {
					if (this.shouldIntercept(filePath)) {
						this.debug(`Intercepting ${methodName}: ${filePath}, flags: ${flags}`);
						const key = this.getStorageKey(filePath);
						
						// 对于写操作，确保文件存在
						if (flags.includes('w') || flags.includes('a')) {
							// 写模式，允许创建新文件
						} else {
							// 读模式，检查文件是否存在
							const exists = this.performSyncOperation(() => this.storageService.exists(key));
							if (!exists) {
								const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as any;
								error.code = 'ENOENT';
								throw error;
							}
						}

						// 创建虚拟文件描述符
						const fd = this.fdCounter++;
						this.fdCache.set(fd, {key, position: 0, flags});
						return fd;
					}
					return originalMethod(filePath, flags, mode);
				};

			case 'closeSync':
				return (fd: number) => {
					if (this.fdCache.has(fd)) {
						this.debug(`Intercepting ${methodName}: fd ${fd}`);
						this.fdCache.delete(fd);
						return;
					}
					return originalMethod(fd);
				};

			case 'readSync':
				return (fd: number, buffer: Buffer, offset: number, length: number, position: number | null) => {
					const fdInfo = this.fdCache.get(fd);
					if (fdInfo) {
						this.debug(`Intercepting ${methodName}: fd ${fd}`);
						
						const data = this.performSyncOperation(() => this.storageService.readFile(fdInfo.key));
						if (!data) {
							return 0; // EOF
						}

						const readPosition = position !== null ? position : fdInfo.position;
						const bytesToRead = Math.min(length, data.length - readPosition);
						
						if (bytesToRead <= 0) {
							return 0; // EOF
						}

						data.copy(buffer, offset, readPosition, readPosition + bytesToRead);
						
						if (position === null) {
							fdInfo.position += bytesToRead;
						}
						
						return bytesToRead;
					}
					return originalMethod(fd, buffer, offset, length, position);
				};

			case 'writeSync':
				return (fd: number, buffer: Buffer, offset: number, length: number, position: number | null) => {
					const fdInfo = this.fdCache.get(fd);
					if (fdInfo) {
						this.debug(`Intercepting ${methodName}: fd ${fd}`);
						
						// 简化实现：重写整个文件
						const dataToWrite = buffer.slice(offset, offset + length);
						this.performSyncOperation(() => this.storageService.writeFile(fdInfo.key, dataToWrite));
						
						if (position === null) {
							fdInfo.position += length;
						}
						
						return length;
					}
					return originalMethod(fd, buffer, offset, length, position);
				};

			// 异步方法
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
						}).catch((error) => callback!(error));
						return;
					}
					return originalMethod(filePath, options, callback!);
				};

			case 'writeFile':
				return (filePath: string, data: any, options: any, callback?: Function) => {
					if (typeof options === 'function') {
						callback = options;
						options = undefined;
					}

					if (this.shouldIntercept(filePath)) {
						this.debug(`Intercepting ${methodName}: ${filePath}`);
						const key = this.getStorageKey(filePath);
						const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
						
						this.storageService.writeFile(key, buffer).then(() => {
							callback!(null);
						}).catch((error) => callback!(error));
						return;
					}
					return originalMethod(filePath, data, options, callback!);
				};

			default:
				// 其他方法保持原样或添加基本的拦截逻辑
				return originalMethod;
		}
	}

	private hookPromiseMethods(): void {
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

		(fs.promises as any).access = async (filePath: string, mode?: number) => {
			if (this.shouldIntercept(filePath)) {
				this.debug(`Intercepting promises.access: ${filePath}`);
				const key = this.getStorageKey(filePath);
				
				const exists = await this.storageService.exists(key);
				if (!exists) {
					const error = new Error(`ENOENT: no such file or directory, access '${filePath}'`) as any;
					error.code = 'ENOENT';
					throw error;
				}
				return;
			}
			return originalPromises.access(filePath, mode);
		};

		(fs.promises as any).stat = async (filePath: string, options?: any) => {
			if (this.shouldIntercept(filePath)) {
				this.debug(`Intercepting promises.stat: ${filePath}`);
				const key = this.getStorageKey(filePath);
				
				const exists = await this.storageService.exists(key);
				if (!exists) {
					const error = new Error(`ENOENT: no such file or directory, stat '${filePath}'`) as any;
					error.code = 'ENOENT';
					throw error;
				}

				return this.createMockStats();
			}
			return originalPromises.stat(filePath, options);
		};
	}

	private createMockStats() {
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
			birthtime: new Date(),
			mode: 0o644,
			nlink: 1,
			uid: process.getuid?.() ?? 0,
			gid: process.getgid?.() ?? 0
		};
	}
}

// 全局实例管理
let globalAdvancedFsHook: AdvancedFsHook | null = null;

export function installAdvancedFsHook(config: AdvancedFsHookConfig): void {
	if (globalAdvancedFsHook) {
		globalAdvancedFsHook.uninstall();
	}
	globalAdvancedFsHook = new AdvancedFsHook(config);
	globalAdvancedFsHook.install();
}

export function uninstallAdvancedFsHook(): void {
	if (globalAdvancedFsHook) {
		globalAdvancedFsHook.uninstall();
		globalAdvancedFsHook = null;
	}
} 