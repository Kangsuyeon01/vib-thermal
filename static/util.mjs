/**
 * Assert Not Null
 * @template T
 * @param {T | null} v
 * @returns {T}
 */
export function notnull(v) {
	if (v != null) return v;
	else throw new TypeError("Unexpected null");
}
/**
 *
 * @param {never} x
 * @returns {never}
 */
export function assert_unreachable(x) {
	throw new Error("Unexpected variant: " + x);
}