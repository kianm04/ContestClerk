/**
 * The pieces every form field in `$lib/components` has in common: the ids that
 * tie a label, a help line and an error message to one input, and the Tailwind
 * classes that give every control the same box.
 *
 * They live here rather than inside one component because six components need
 * them, and a rule kept in one place cannot drift between fields.
 */

/** The id of the input itself. `fieldId('city')` is `field-city`. */
export function fieldId(name: string): string {
	return `field-${name}`;
}

/** The id of the error message under a field. */
export function fieldErrorId(name: string): string {
	return `${fieldId(name)}-error`;
}

/** The id of the help line under a field. */
export function fieldHelpId(name: string): string {
	return `${fieldId(name)}-help`;
}

/** Which of the two lines under a field exist, so `aria-describedby` can name them. */
export type FieldDescriptions = {
	hasHelp: boolean;
	hasError: boolean;
};

/**
 * What a field's `aria-describedby` should point at: the help line, the error
 * message, or both, separated by a space. Comes back `undefined` when there is
 * neither, because an empty `aria-describedby` confuses a screen reader.
 */
export function fieldDescribedBy(
	name: string,
	descriptions: FieldDescriptions
): string | undefined {
	const ids: string[] = [];

	if (descriptions.hasHelp) {
		ids.push(fieldHelpId(name));
	}

	if (descriptions.hasError) {
		ids.push(fieldErrorId(name));
	}

	if (ids.length === 0) {
		return undefined;
	}

	return ids.join(' ');
}

/**
 * What a text input, a textarea and a select look like: the white box with a
 * line border and the 10px control radius of the design system. `min-h-11` is
 * the 44px minimum touch target.
 */
export const CONTROL_CLASSES =
	'block min-h-11 w-full rounded-control border border-border bg-background px-3 py-2 text-body text-foreground placeholder:text-placeholder';

/**
 * The conference directory's search box, which is the first thing on its page
 * (T180): a 3.25rem pill with a soft shadow, as the product owner's mockup draws it
 * (Trello WMcXfry0). It is a whole list of its own rather than `CONTROL_CLASSES`
 * with more classes added, because with both `min-h-11` and `min-h-13` on one
 * element, which one wins depends on the order Tailwind happens to write its CSS in.
 */
export const LARGE_CONTROL_CLASSES =
	'block min-h-13 w-full rounded-full border border-border bg-background px-5 py-3 text-body text-foreground shadow-card placeholder:text-placeholder';

/** The small capitals above a field. A Tailwind text token cannot carry `uppercase`. */
export const LABEL_CLASSES = 'mb-1 block text-label text-muted-foreground uppercase';

/**
 * The organiser's management pages (the manage redesign) hold more on one
 * screen, so their fields are a little more compact: a 40px box from `lg` up,
 * where a phone keeps the 44px touch target. A whole list of its own for the
 * same reason as `LARGE_CONTROL_CLASSES`.
 */
export const DENSE_CONTROL_CLASSES =
	'block min-h-11 w-full rounded-control border border-border bg-background px-3 py-2 text-body text-foreground placeholder:text-placeholder lg:min-h-10';

/** The label above a field on the management pages: dark, in sentence case. */
export const DENSE_LABEL_CLASSES = 'mb-1.5 block text-small font-medium text-foreground';

/** The classes of a field's box: compact on the management pages, ordinary elsewhere. */
export function controlClasses(isDense: boolean): string {
	if (isDense) {
		return DENSE_CONTROL_CLASSES;
	}

	return CONTROL_CLASSES;
}

/** The classes of a field's label: compact on the management pages, ordinary elsewhere. */
export function labelClasses(isDense: boolean): string {
	if (isDense) {
		return DENSE_LABEL_CLASSES;
	}

	return LABEL_CLASSES;
}
