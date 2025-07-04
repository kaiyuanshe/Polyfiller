import {container} from "./services.js";
import type {IApiService} from "./service/api/i-api-service.js";
import type {ICacheRegistryService} from "./service/registry/cache-registry/i-cache-registry-service.js";
import type {ILoggerService} from "./service/logger/i-logger-service.js";
import {setupStorageServices} from "./service/storage/storage-integration-example.js";

// Initialize storage services, then cache registry, then launch the server
async function bootstrap(): Promise<void> {
	const logger = container.get<ILoggerService>();
	
	try {
		// 1. Setup storage services (S3 + fs hook)
		await setupStorageServices(logger);
		
		// 2. Initialize the cache registry
		await container.get<ICacheRegistryService>().initialize();
		
		// 3. Start the API server
		await container.get<IApiService>().start();
		
		logger.info("🚀 Polyfiller application started successfully");
	} catch (error) {
		logger.error("❌ Failed to start application:", error);
		process.exit(1);
	}
}

// Start the application
bootstrap();

// Exports
export {PolyfillName} from "./polyfill/polyfill-name.js";
export {polyfillRawForceName} from "./polyfill/polyfill-raw-force-name.js";
export {polyfillOptionValueSeparator} from "./polyfill/polyfill-option-value-separator.js";
export {polyfillRawDivider} from "./polyfill/polyfill-raw-divider.js";
export {polyfillRawSeparator} from "./polyfill/polyfill-raw-separator.js";
