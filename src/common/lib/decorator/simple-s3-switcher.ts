/**
 * 简单的S3方法切换装饰器
 * 如果是S3路径就用当前方法，否则调用父类方法
 */
export function S3OrLocal() {
	return function (_target: any, propertyName: string, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value;
		
		descriptor.value = function (this: any, path: string, ...args: any[]) {
			if (this.isS3Path(path)) {
				// 使用当前类的方法（S3实现）
				return originalMethod.call(this, path, ...args);
			} else {
				// 使用父类的方法（本地文件系统实现）
				return Object.getPrototypeOf(Object.getPrototypeOf(this))[propertyName].call(this, path, ...args);
			}
		};
		
		return descriptor;
	};
}
