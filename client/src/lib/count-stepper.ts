/**
 * The arithmetic of `CountStepper`, the − and + around a number field that
 * the Motions view counts a motion's hands with and the Vote view a show of
 * hands (`specs/03-design/components.md`, "The session console"). Plain
 * functions, so the rules can be read and tested without a browser.
 *
 * A count is a whole number of 0 or more, or null for "not counted yet": an
 * empty field. Motions tell the two apart (with no count, Pass and Fail are
 * equal); the Vote view always passes a number.
 */

/**
 * The count typed in the field: a whole number of 0 or more, or null when the
 * field is empty or holds anything else ("4.5", "-1", "four"). Spaces around
 * it do not matter.
 */
export function readTypedCount(text: string): number | null {
	const trimmed = text.trim();

	if (!/^\d+$/.test(trimmed)) return null;

	return Number(trimmed);
}

/**
 * The count after a press of − (`step` -1) or + (`step` 1). It never goes
 * below 0. A field not counted yet stays empty on −, and + makes it 1.
 */
export function steppedCount(value: number | null, step: 1 | -1): number | null {
	if (value === null) return step === 1 ? 1 : null;

	return Math.max(0, value + step);
}
