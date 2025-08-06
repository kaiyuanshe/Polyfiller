/**
 * simple S3 method switcher decorator
 * if the path is S3 path, use the current method, otherwise call the parent class method
 */
export function S3OrLocal() {
	return function (_target: any, propertyName: string, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value;
		
		descriptor.value = function (this: any, path: string, ...args: any[]) {
			if (this.isS3Path(path)) {
				// use the current class method (S3 implementation)
				return originalMethod.call(this, path, ...args);
			} else {
				// use the parent class method (local file system implementation)
				return Object.getPrototypeOf(Object.getPrototypeOf(this))[propertyName].call(this, path, ...args);
			}
		};
		
		return descriptor;
	};
}
