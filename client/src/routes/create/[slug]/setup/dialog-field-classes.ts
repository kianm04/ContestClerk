/**
 * The field the Setup dialogs' designs draw, written once so every input and
 * dropdown in them is the same: 40 pixels tall, an 8 pixel corner, the pale
 * input border, 17 pixel words, and a 2 pixel blue border while it has the
 * focus (as the Create committee design draws the name being typed).
 *
 * shadcn's `Input` brings `text-base md:text-sm`, which `cn` cannot tell are
 * the same kind as `fs-17`, so the size is said for `md:` as well.
 */
export const DIALOG_INPUT_CLASSES =
	'h-10 rounded-md border-creation-input-border bg-white px-3.5 py-0 fs-17 lh-24 text-creation-ink-950 placeholder:text-creation-ink-200 focus-visible:border-2 focus-visible:border-creation-blue-focus focus-visible:px-3.25 focus-visible:ring-0 md:fs-17 max-lg:min-h-11';
