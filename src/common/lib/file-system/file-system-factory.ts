import type {FileSystem} from "./file-system";
import {realFileSystem} from "./real-file-system";
import {S3FileSystem} from "./s3-file-system";
import type {Config} from "../../../config/config";

export function createFileSystem(config: Config): FileSystem {
	if (config.enableS3Storage) {
		return new S3FileSystem(config);
	}
	return realFileSystem;
} 