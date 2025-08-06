import type {FileSystem} from "./file-system";
import {realFileSystem} from "./real-file-system";
import {S3FileSystem} from "./s3-file-system";
import type {Config} from "../../../config/config";
import type {ILoggerService} from "../../../service/logger/i-logger-service";

export function createFileSystem(config: Config, logger: ILoggerService): FileSystem {
	if (config.enableS3Storage) {
		return new S3FileSystem(config, logger);
	}
	return realFileSystem;
} 