/** The look of a `Button`; `03-design/components.md` says which to use where. */
export type ButtonVariant =
	'primary' | 'secondary' | 'ghost' | 'danger' | 'soft-danger' | 'quiet-danger';

/**
 * `sm` is a smaller button for a table row. Both stay 44px tall to stay
 * tappable. `lg` is the chair's four speech controls (T128), drawn as large as
 * the session mockup draws them.
 *
 * `dense` and `dense-sm` are the management pages' buttons (the manage
 * redesign), which sit in tables and headers that hold more on one screen.
 * They are 44px tall on a phone and a tablet like every other button, and only
 * shrink from `lg` up, where a mouse rather than a finger presses them:
 * `dense` to 2.5rem and `dense-sm`, the button inside a table row, to 2rem.
 */
export type ButtonSize = 'md' | 'sm' | 'lg' | 'dense' | 'dense-sm';

/**
 * How long a button waits for the server before it shows its spinner, in
 * milliseconds. Most answers come back sooner, and a spinner that flashes on
 * for a moment and off again looks more like a fault than progress (T140).
 */
export const BUSY_INDICATOR_DELAY_MS = 400;

/* Written out in full, because Tailwind reads the class names out of this
   file and cannot follow a name that is glued together while the page runs. */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
	// Dark blue, the colour the design system keeps for the one action that matters.
	primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
	secondary: 'border border-border bg-background text-foreground hover:bg-muted',
	ghost: 'text-link hover:bg-accent',
	danger: 'bg-destructive text-primary-foreground hover:bg-destructive/90',
	// Red, but quieter than `danger`: the chair's "End speech", which sits beside
	// the blue "Next speaker" and must not shout louder than it, and a destructive
	// button that is not the page's main action, such as "Withdraw application"
	// (T136). Its confirmation still answers with the loud `danger` button.
	'soft-danger':
		'border border-destructive/30 bg-destructive-muted text-destructive hover:bg-destructive-muted/70',
	// Grey until the pointer is on it, then red: the delete icon on every row of a
	// management list (the manage redesign), where a red button on each row would
	// shout down the list. Its confirmation still answers with the loud `danger`.
	'quiet-danger': 'text-muted-foreground hover:bg-destructive-muted hover:text-destructive'
};

/* `min-h-11` is the 44px touch target the design system asks of everything
   tappable, so the small button only loses padding and text size. */
const SIZE_CLASSES: Record<ButtonSize, string> = {
	md: 'min-h-11 px-4 py-2 text-body',
	sm: 'min-h-11 px-3 py-1.5 text-small',
	lg: 'min-h-14 px-5 py-3 text-body',
	dense: 'min-h-11 px-4 py-2 text-dense lg:min-h-10 lg:py-0',
	'dense-sm': 'min-h-11 px-3 py-1.5 text-small lg:min-h-8 lg:rounded-lg lg:py-0'
};

/** The icon beside a button's words: smaller on the dense management buttons. */
export function buttonIconSize(size: ButtonSize): number {
	if (size === 'dense' || size === 'dense-sm') {
		return 16;
	}

	return 20;
}

const SHARED_CLASSES =
	'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors duration-150';

/*
   A button with a key in the chair console shows the key over its corner on
   hover and focus (`Kbd.svelte`). `relative` is what the hint is placed
   against, and `group/key` names the button as the group whose hover and
   focus the hint reads.
*/
const KEY_SHORTCUT_CLASSES = 'group/key relative';

/**
 * The Tailwind classes of a `Button`, link or real button alike. It lives
 * outside the component so `Button.svelte` stays short enough to read.
 * `hasKeyShortcut` adds what the key's hint needs (`Kbd`).
 */
export function buttonClasses(
	variant: ButtonVariant,
	size: ButtonSize,
	isFullWidth: boolean,
	hasKeyShortcut: boolean = false
): string {
	const widthClass = isFullWidth ? 'w-full' : '';
	const keyClass = hasKeyShortcut ? KEY_SHORTCUT_CLASSES : '';

	return `${SHARED_CLASSES} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${widthClass} ${keyClass}`;
}

/**
 * The classes of one line of a `Dropdown` menu, a link or a button. `danger`
 * colours a destructive line red. Written out in full for Tailwind.
 */
export function menuItemClasses(tone: 'default' | 'danger' | undefined): string {
	const shared = 'flex min-h-11 w-full items-center px-3 text-left text-body';

	if (tone === 'danger') {
		return `${shared} text-destructive hover:bg-destructive-muted`;
	}

	return `${shared} text-foreground hover:bg-muted`;
}

/**
 * The classes that turn a shadcn outline `Button` into one chip of the
 * conference directory's row of quick filters (Trello WMcXfry0), shared by the
 * chips that are links and by "More", which opens a menu, so the two always
 * match. A chip is a white pill, or light blue with dark blue words while the
 * results are filtered its way. It is 44px tall on a phone and 2.5rem from
 * `lg` up, as the mockup draws it. Only sizing, shape and colour classes, which
 * the button's class merger lets through; a type token would not be.
 */
export function quickFilterChipClasses(isActive: boolean): string {
	const shared = 'h-11 gap-2.5 rounded-full px-5 lg:h-10';

	if (isActive) {
		return `${shared} border-brand-100 bg-brand-100 text-brand-900 hover:bg-brand-100 hover:text-brand-900`;
	}

	return `${shared} hover:border-brand-500 hover:bg-background`;
}
