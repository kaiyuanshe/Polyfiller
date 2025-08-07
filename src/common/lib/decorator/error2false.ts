/**
 * decorator for method that returns boolean
 * if the method throws an error, return false
 */
export function error2false<T extends (...args: any[]) => Promise<boolean>>(
	target: T,
	context: ClassMethodDecoratorContext<any, T>
): T {
	const methodName = context.name as string;

	return (async function (this: any, ...args: any[]): Promise<boolean> {
		try {
			return await target.call(this, ...args);
		} catch (error) {
			// optional: log the error
			if (this.logger && typeof this.logger.debug === "function") {
				this.logger.debug(`Method ${methodName} caught error:`, error);
			}
			return false;
		}
	}) as T;
}

/**
 * synchronous version of error2false decorator
 * for synchronous methods
 */
export function error2falseSync<T extends (...args: any[]) => boolean>(
	target: T,
	context: ClassMethodDecoratorContext<any, T>
): T {
	const methodName = context.name as string;

	return (function (this: any, ...args: any[]): boolean {
		try {
			return target.call(this, ...args);
		} catch (error) {
			// optional: log the error
			if (this.logger && typeof this.logger.debug === "function") {
				this.logger.debug(`Method ${methodName} caught error:`, error);
			}
			return false;
		}
	}) as T;
}
