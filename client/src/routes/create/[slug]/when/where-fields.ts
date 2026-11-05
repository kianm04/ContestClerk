/**
 * The design's label and field for the "Where is it happening?" panel, shared
 * by its fields so the five of them stay alike: a 16 over 20 semibold label,
 * then a 36 pixel field, which the caller sets 4 pixels under it (`mt-1`), with 14 pixels inside its edges.
 * `md:text-base` replaces the smaller text shadcn's `Input` takes from `md` up.
 * On a phone a field is 44 pixels tall, the least a thumb can press.
 */
export const LABEL_CLASSES = 'block fs-16 lh-20 font-semibold text-creation-ink-900';

export const FIELD_CLASSES =
	'h-9 rounded-md border-creation-input-border bg-white px-3.5 text-base fs-16 text-creation-ink-950 md:text-base max-lg:min-h-11';

/**
 * A dropdown button, drawn like the fields: white, a hairline border, 14
 * pixels of padding, an icon at the left when there is one and the chevron at
 * the right. The height is the caller's: 40 pixels in When, 36 in Where.
 */
export const DROPDOWN_CLASSES =
	'flex w-full min-w-0 items-center gap-3.5 rounded-md border border-creation-input-border bg-white px-3.5 text-left fs-16 font-normal text-creation-ink-950 outline-none max-lg:min-h-11 focus-visible:border-creation-blue-focus focus-visible:ring-2 focus-visible:ring-creation-blue-focus/30 disabled:cursor-not-allowed disabled:bg-creation-field disabled:text-creation-ink-100 aria-invalid:border-creation-red';
