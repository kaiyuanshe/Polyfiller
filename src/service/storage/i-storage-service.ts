export interface IStorageService {
	/**
	 * 读取文件
	 */
	readFile(key: string): Promise<Buffer | null>;

	/**
	 * 写入文件
	 */
	writeFile(key: string, data: Buffer): Promise<void>;

	/**
	 * 检查文件是否存在
	 */
	exists(key: string): Promise<boolean>;

	/**
	 * 删除文件
	 */
	deleteFile(key: string): Promise<void>;

	/**
	 * 列出文件
	 */
	listFiles(prefix?: string): Promise<string[]>;

	/**
	 * 预热缓存
	 */
	warmupCache(): Promise<void>;
} 