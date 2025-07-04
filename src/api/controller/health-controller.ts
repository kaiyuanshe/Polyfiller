import {GET} from "../decorator/api-method/get.js";

export class HealthController {
	constructor() {
		// 简化构造函数，使用 console.log 替代依赖注入的 logger
	}

	/**
	 * 基础健康检查端点
	 */
	@GET({path: "/health"})
	async health(): Promise<{status: string; timestamp: string}> {
		return {
			status: "healthy",
			timestamp: new Date().toISOString()
		};
	}

	/**
	 * 详细健康检查端点，包含存储状态
	 */
	@GET({path: "/health/detailed"})
	async detailedHealth(): Promise<{
		status: string;
		timestamp: string;
		services: {
			storage: string;
			cache: string;
		};
		uptime: number;
	}> {
		const uptime = process.uptime();
		
		// 基础存储检查
		let storageStatus = "healthy";
		let cacheStatus = "healthy";

		try {
			// 这里可以添加更详细的存储检查
			// 例如：检查 S3 连接、本地缓存状态等
		} catch (error) {
			console.log("Health check detected storage issue:", error);
			storageStatus = "degraded";
		}

		return {
			status: storageStatus === "healthy" && cacheStatus === "healthy" ? "healthy" : "degraded",
			timestamp: new Date().toISOString(),
			services: {
				storage: storageStatus,
				cache: cacheStatus
			},
			uptime
		};
	}

	/**
	 * 就绪检查端点
	 */
	@GET({path: "/ready"})
	async ready(): Promise<{ready: boolean; message: string}> {
		// 检查应用是否完全启动
		const isReady = process.uptime() > 10; // 简单检查：启动超过10秒
		
		return {
			ready: isReady,
			message: isReady ? "Application is ready" : "Application is starting up"
		};
	}

	/**
	 * 存活检查端点
	 */
	@GET({path: "/live"})
	async liveness(): Promise<{alive: boolean}> {
		return {alive: true};
	}
} 