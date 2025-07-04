/* eslint-disable @typescript-eslint/naming-convention */
export const environmentDefaults = {
	SENTRY_DSN: undefined as string | undefined,
	KEY: undefined as string | undefined,
	CERT: undefined as string | undefined,
	LOG_LEVEL: "info",
	NODE_ENV: "development",
	TESTING: "false",
	HTTPS: "false",
	CLEAR_CACHE: "false",
	HOST: "0.0.0.0",
	PORT: "3000",
	VOLUMES: "",
	// S3 Storage Configuration
	S3_ENDPOINT: undefined as string | undefined,
	S3_REGION: "us-east-1",
	S3_BUCKET: "polyfill-cache",
	S3_ACCESS_KEY_ID: undefined as string | undefined,
	S3_SECRET_ACCESS_KEY: undefined as string | undefined,
	LOCAL_CACHE_DIR: "/tmp/@wessberg/polyfiller",
	MAX_CACHE_SIZE: "500", // MB
	// File System Hook Configuration
	ENABLE_FS_HOOK: "false",
	FS_HOOK_MOUNT_PATH: undefined as string | undefined, // 默认使用 LOCAL_CACHE_DIR
	FS_HOOK_DEBUG: "false",
	FS_HOOK_SYNC_TIMEOUT: "5000", // 5秒超时
	FS_HOOK_CACHE_SIZE: "100" // 缓存条目数量
};
