/**
 * S3 method switcher decorator
 * If the path is S3 path, use the current method, otherwise call the parent class method
 */
export function S3OrLocal<T extends { isS3Path(path: string): boolean }>(
	target: (this: T, path: string, ...args: any[]) => any,
	context: ClassMethodDecoratorContext<T>
) {
	const methodName = context.name as string;
	
	return function (this: T, path: string, ...args: any[]) {
		if (this.isS3Path(path)) {
			// Use the current class method (S3 implementation)
			return target.call(this, path, ...args);
		} else {
			// Use the parent class method (local file system implementation)
			const parent = Object.getPrototypeOf(Object.getPrototypeOf(this));
			const parentMethod = parent[methodName];
			
			if (typeof parentMethod !== 'function') {
				throw new Error(`Parent method ${methodName} not found or is not a function`);
			}
			
			return parentMethod.call(this, path, ...args);
		}
	};
}
