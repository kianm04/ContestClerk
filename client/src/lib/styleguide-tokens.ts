/**
 * The design tokens the styleguide page lists: the colours, the type scale, the
 * spacing and radius steps and the icon sizes.
 *
 * The real values live in `src/routes/layout.css` under `@theme`, which is what
 * Tailwind reads. These lists only say which of them to put on the page and
 * what to call each one, so a teammate can see the whole palette at once and
 * copy the class name. When a token is added to `layout.css`, add it here too.
 *
 * The class names are written out in full rather than glued together while the
 * page runs, because Tailwind finds the classes it has to generate by reading
 * the source files as text and cannot follow a name that is built at run time.
 *
 * Nothing here talks to Supabase or to Svelte. The values come from
 * `specs/03-design/design-system.md`.
 */

/** One colour in the palette, as the styleguide shows it. */
export type ColourToken = {
	/** The token's name in `layout.css`, such as `--color-brand-700`. */
	name: string;
	/** The hex value, repeated here only so the page can print it. */
	hex: string;
	/** The Tailwind class that paints a swatch in this colour. */
	swatchClass: string;
	/** What the design system says this colour is for. */
	use: string;
};

/** Every colour token, in the order `design-system.md` lists them. */
export const COLOUR_TOKENS: ColourToken[] = [
	{
		name: '--color-brand-900',
		hex: '#0B2A5B',
		swatchClass: 'bg-brand-900',
		use: 'Dark blue: primary buttons, the logo, the selected navigation item, serif titles on site pages'
	},
	{
		name: '--color-brand-800',
		hex: '#173B73',
		swatchClass: 'bg-brand-800',
		use: 'Primary button hover'
	},
	{
		name: '--color-brand-700',
		hex: '#006FCC',
		swatchClass: 'bg-brand-700',
		use: 'Links, and any other light blue that carries words'
	},
	{
		name: '--color-brand-500',
		hex: '#0098FC',
		swatchClass: 'bg-brand-500',
		use: "The logo's light blue: lines, bars, dots and focus rings, never words"
	},
	{
		name: '--color-brand-100',
		hex: '#D9EEFF',
		swatchClass: 'bg-brand-100',
		use: 'A chosen option, a selected row; words on it are brand-900'
	},
	{
		name: '--color-brand-50',
		hex: '#EEF7FF',
		swatchClass: 'bg-brand-50',
		use: 'Row hover, subtle highlight'
	},
	{ name: '--color-ink-900', hex: '#111318', swatchClass: 'bg-ink-900', use: 'Body text' },
	{ name: '--color-ink-600', hex: '#545A63', swatchClass: 'bg-ink-600', use: 'Secondary text' },
	{
		name: '--color-ink-400',
		hex: '#9AA0A9',
		swatchClass: 'bg-ink-400',
		use: 'Placeholder, disabled text'
	},
	{ name: '--color-line', hex: '#E3E6EB', swatchClass: 'bg-line', use: 'Borders and dividers' },
	{
		name: '--color-ground',
		hex: '#EEF7FF',
		swatchClass: 'bg-ground',
		use: 'A queue row under the pointer'
	},
	{
		name: '--color-surface',
		hex: '#FFFFFF',
		swatchClass: 'bg-surface',
		use: 'Cards, inputs, navigation'
	},
	{
		name: '--color-success-700',
		hex: '#15803D',
		swatchClass: 'bg-success-700',
		use: 'Accepted, paid'
	},
	{
		name: '--color-success-100',
		hex: '#DCFCE7',
		swatchClass: 'bg-success-100',
		use: 'Behind success text'
	},
	{
		name: '--color-warning-700',
		hex: '#B45309',
		swatchClass: 'bg-warning-700',
		use: 'Pending, waitlisted, due soon'
	},
	{
		name: '--color-warning-100',
		hex: '#FEF3C7',
		swatchClass: 'bg-warning-100',
		use: 'Behind warning text'
	},
	{
		name: '--color-danger-700',
		hex: '#B91C1C',
		swatchClass: 'bg-danger-700',
		use: 'Rejected, errors, destructive'
	},
	{
		name: '--color-danger-100',
		hex: '#FEE2E2',
		swatchClass: 'bg-danger-100',
		use: 'Behind error text'
	},
	{
		name: '--color-neutral-700',
		hex: '#3A3F47',
		swatchClass: 'bg-neutral-700',
		use: 'Draft, archived, withdrawn'
	},
	{
		name: '--color-neutral-100',
		hex: '#F3F4F6',
		swatchClass: 'bg-neutral-100',
		use: 'Behind neutral text'
	},
	{
		name: '--color-sand-700',
		hex: '#7A5C3E',
		swatchClass: 'bg-sand-700',
		use: '"For organisers" over the desk picture on the landing page'
	},
	{
		name: '--color-mist',
		hex: '#F7FBFE',
		swatchClass: 'bg-mist',
		use: 'The landing page under its pictures'
	},
	{
		name: '--color-violet-700',
		hex: '#5B3FA8',
		swatchClass: 'bg-violet-700',
		use: 'Words on a violet committee chip'
	},
	{
		name: '--color-violet-100',
		hex: '#F1EFFC',
		swatchClass: 'bg-violet-100',
		use: 'Behind a violet committee chip'
	}
];

/** One step of the type scale, as the styleguide shows it. */
export type TypeStyle = {
	/** The name `design-system.md` gives the style, such as `H1`. */
	name: string;
	/** The classes the markup writes to get it, including the font and any phone twin. */
	className: string;
	/** The size and line height, for the caption. */
	size: string;
	use: string;
};

/**
 * Every style in the type scale.
 *
 * `Display` and `H1` shrink on a phone, which one Tailwind token cannot hold, so
 * each names both its twins and the browser picks by width. `Pitch` and
 * `Closing`, the landing page's, grow a third time from `lg` up, and
 * `[font-variation-settings:normal]` lets them take the serif's shape for large
 * type, as the comment on `body` in `layout.css` explains.
 *
 * The serif titles carry `text-brand-900`, the dark blue they take on site
 * pages. The chair's console keeps its titles `ink-900`, because colour there
 * means state, and so does the landing page, after its mockup (Trello RBz46aTQ).
 */
export const TYPE_SCALE: TypeStyle[] = [
	{
		name: 'Display',
		className: 'font-display text-display-mobile text-brand-900 md:text-display',
		size: '44/48, 32/36 on a phone',
		use: 'Conference hero, landing headlines on a phone or tablet'
	},
	{
		name: 'Pitch',
		className:
			'font-display text-display-mobile [font-variation-settings:normal] md:text-display lg:text-pitch',
		size: '46/46 from a laptop up, Display below',
		use: 'The two landing headlines'
	},
	{
		name: 'Closing',
		className:
			'font-display text-h1-mobile [font-variation-settings:normal] md:text-h1 lg:text-closing',
		size: '28.8/36 from a laptop up, H1 below',
		use: 'The last heading of the landing page'
	},
	{
		name: 'Hero',
		className: 'font-display text-display-mobile md:text-hero',
		size: '48/52, 32/36 on a phone',
		use: 'The conference directory headline, until Trello VtIlOpkB took it away'
	},
	{
		name: 'Hero lead',
		className: 'font-display text-body md:text-hero-lead',
		size: '18/22',
		use: 'The line at the top of the conference directory'
	},
	{
		name: 'Greeting',
		className: 'font-display text-display-mobile text-brand-900 md:text-greeting',
		size: '32/40, 32/36 on a phone',
		use: 'The greeting on the home page'
	},
	{
		name: 'H1',
		className: 'font-display text-h1-mobile text-brand-900 md:text-h1',
		size: '32/40, 26/32 on a phone',
		use: 'Page title'
	},
	{
		name: 'H2',
		className: 'font-display text-h2 text-brand-900',
		size: '22/28',
		use: 'Card and section titles'
	},
	{ name: 'H3', className: 'text-h3', size: '16/24', use: 'List item titles' },
	{ name: 'Body', className: 'text-body', size: '15/24', use: 'Everything' },
	{ name: 'Small', className: 'text-small', size: '13/20', use: 'Meta lines, help text' },
	{
		name: 'Caption',
		className: 'text-caption',
		size: '12/16',
		use: 'The small print of the example on the landing page'
	},
	{
		name: 'Label',
		className: 'text-label uppercase',
		size: '13/16',
		use: 'Form labels, table headers, eyebrows'
	}
];

/** One spacing or radius step, drawn as a box. */
export type ShapeToken = {
	/** What to call it, such as `Card padding` or `rounded-2xl`. */
	name: string;
	/** The classes that size or round the box shown next to the name. */
	boxClass: string;
	note: string;
};

/** The spacing steps the design system names. The base unit is 4px. */
export const SPACING_TOKENS: ShapeToken[] = [
	{ name: '4px · base unit', boxClass: 'h-6 w-1', note: 'Everything is a multiple of this' },
	{
		name: '16px · phone gutter',
		boxClass: 'h-6 w-4',
		note: 'Page edge and card padding on a phone'
	},
	{
		name: '24px · page gutter',
		boxClass: 'h-6 w-6',
		note: 'Page edge, card padding, gap between cards'
	},
	{ name: '40px · section gap', boxClass: 'h-6 w-10', note: 'Between one section and the next' }
];

/** The two radii and the one shadow. */
export const SHAPE_TOKENS: ShapeToken[] = [
	{
		name: 'rounded-2xl · 16px',
		boxClass: 'h-16 w-16 rounded-2xl bg-brand-100',
		note: 'Cards and modals'
	},
	{
		name: 'rounded-control · 10px',
		boxClass: 'h-16 w-16 rounded-control bg-brand-100',
		note: 'Inputs and buttons'
	},
	{
		name: 'rounded-full',
		boxClass: 'h-16 w-16 rounded-full bg-brand-100',
		note: 'Badges and avatars'
	},
	{
		name: 'shadow-card',
		boxClass: 'h-16 w-16 rounded-2xl bg-surface shadow-card',
		note: 'Hovering a clickable card, and floating things'
	}
];

/** One icon size, as the styleguide shows it. */
export type IconSize = {
	/** The number given to a lucide icon's `size` prop. */
	pixels: number;
	use: string;
};

/**
 * The two icon sizes the design system allows.
 *
 * The 36px in the design system is the `brand-50` square a section title's icon
 * sits in, not an icon size; the icon inside it is still 20px. The styleguide
 * draws that chip beside these two.
 */
export const ICON_SIZES: IconSize[] = [
	{ pixels: 20, use: 'Everywhere in the interface' },
	{ pixels: 24, use: 'Navigation, and the one picture on an empty state' }
];
