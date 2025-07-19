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
	// S3 config
	ENABLE_S3_STORAGE: "false",
	S3_REGION: undefined as string | undefined,
	S3_BUCKET: undefined as string | undefined,
	S3_ACCESS_KEY_ID: undefined as string | undefined,
	S3_SECRET_ACCESS_KEY: undefined as string | undefined,
	S3_ENDPOINT: undefined as string | undefined,
	S3_FORCE_PATH_STYLE: "false"
};
