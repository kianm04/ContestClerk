import { expect, type Page } from '@playwright/test';

// Three accessibility checks a person would otherwise make by hand, written down
// so a browser test makes them instead. They cover the baseline in
// `specs/03-design/design-system.md`: every control has a name, the keyboard
// focus ring can be seen, and text is readable against what is behind it.
//
// They are deliberately small. They are not a full accessibility audit, and a
// page that passes them can still be hard to use; they catch the mistakes that
// are easy to make and easy to miss.

/**
 * The smallest contrast ratio WCAG AA allows for ordinary text, and the smaller
 * one it allows for large text (24px, or about 18.7px when bold).
 */
const NORMAL_TEXT_CONTRAST = 4.5;
const LARGE_TEXT_CONTRAST = 3;

/**
 * How many times `expectVisibleFocusEverywhere` presses Tab. Enough to reach the
 * top bar, the page's own controls and the footer on every public page.
 */
const MAXIMUM_TAB_PRESSES = 60;

/**
 * Fails when a form field, button or link has no name a screen reader could
 * read out: an input with no `<label>`, or an icon button with no `aria-label`.
 */
export async function expectEveryControlNamed(page: Page): Promise<void> {
	const unnamed = await page.evaluate(() => {
		function describe(element: Element): string {
			const name = element.getAttribute('name') ?? element.getAttribute('href') ?? '';
			return `<${element.tagName.toLowerCase()} ${name}>`;
		}

		function hasNameAttribute(element: Element): boolean {
			const ariaLabel = element.getAttribute('aria-label')?.trim();
			const labelledBy = element.getAttribute('aria-labelledby')?.trim();
			const title = element.getAttribute('title')?.trim();
			return Boolean(ariaLabel || labelledBy || title);
		}

		const problems: string[] = [];

		const fields = document.querySelectorAll('input, select, textarea');
		for (const field of fields) {
			const type = field.getAttribute('type');
			if (type === 'hidden' || type === 'submit' || type === 'button') continue;
			// shadcn's Select and Checkbox send their value through an input a
			// screen reader is told to skip; the labelled button beside it is the
			// control a person uses.
			if (field.getAttribute('aria-hidden') === 'true') continue;

			const labels = (field as HTMLInputElement).labels;
			const hasLabel = labels !== null && labels.length > 0;
			if (!hasLabel && !hasNameAttribute(field)) problems.push(describe(field));
		}

		const clickables = document.querySelectorAll('a[href], button');
		for (const clickable of clickables) {
			const text = clickable.textContent?.trim() ?? '';
			const imageWithAlt = clickable.querySelector('img[alt]:not([alt=""])');
			// A button is named by a `<label for>` too, as shadcn's tick box is
			// by the words beside it.
			const buttonLabels = clickable instanceof HTMLButtonElement ? clickable.labels : null;
			const hasLabel = buttonLabels !== null && buttonLabels.length > 0;
			if (text === '' && !imageWithAlt && !hasLabel && !hasNameAttribute(clickable)) {
				problems.push(describe(clickable));
			}
		}

		const imagesWithoutAlt = document.querySelectorAll('img:not([alt])');
		for (const image of imagesWithoutAlt) problems.push(`<img src="${image.getAttribute('src')}">`);

		return problems;
	});

	expect(unnamed, 'These controls or images have no accessible name.').toEqual([]);
}

/** What `expectVisibleFocusEverywhere` may be told to do differently. */
export type FocusOptions = {
	/**
	 * Whether the first Tab must reach the skip link. True for a page that has
	 * just loaded; false after a form was sent back with errors, because the
	 * browser then carries on from the field it last focused.
	 */
	startsAtSkipLink?: boolean;
};

/**
 * Presses Tab through the page and fails when a focused element draws no ring,
 * which would leave a keyboard user not knowing where they are. On a page that
 * has just loaded, the first Tab must land on the "Skip to content" link.
 */
export async function expectVisibleFocusEverywhere(
	page: Page,
	options: FocusOptions = {}
): Promise<void> {
	const startsAtSkipLink = options.startsAtSkipLink ?? true;

	// Start from the top of the document, as a fresh page load would.
	await page.locator('body').focus();

	const withoutRing: string[] = [];
	const seen = new Set<string>();

	for (let press = 0; press < MAXIMUM_TAB_PRESSES; press++) {
		await page.keyboard.press('Tab');

		const focused = await page.evaluate(() => {
			const element = document.activeElement;
			if (!element || element === document.body) return null;

			const style = getComputedStyle(element);
			const outlineWidth = parseFloat(style.outlineWidth);
			const hasOutline = style.outlineStyle !== 'none' && outlineWidth >= 2;
			const hasRing = style.boxShadow !== 'none';
			const label = (element.textContent?.trim() || element.getAttribute('aria-label')) ?? '';

			// The element's place in the document, so the loop can tell when Tab
			// has wrapped round to where it started.
			const path: number[] = [];
			let current: Element | null = element;
			while (current?.parentElement) {
				path.unshift(Array.from(current.parentElement.children).indexOf(current));
				current = current.parentElement;
			}

			return {
				key: path.join('.'),
				description: `<${element.tagName.toLowerCase()}> ${label.slice(0, 40)}`,
				isRingVisible: hasOutline || hasRing
			};
		});

		if (focused === null) break;
		if (seen.has(focused.key)) break;
		seen.add(focused.key);

		if (press === 0 && startsAtSkipLink) {
			expect(focused.description, 'The first Tab should reach the skip link.').toContain(
				'Skip to content'
			);
		}
		if (!focused.isRingVisible) withoutRing.push(focused.description);
	}

	expect(withoutRing, 'These elements draw no focus ring when reached by Tab.').toEqual([]);
}

/**
 * Fails when a piece of text is fainter against its background than WCAG AA
 * allows. The background is whatever is drawn under the middle of the text, so
 * a translucent layer over a photo counts. Text over a photograph or a gradient
 * with no solid layer between cannot be measured this way and is skipped, as
 * are disabled controls, which WCAG leaves out.
 */
export async function expectReadableContrast(page: Page): Promise<void> {
	const failures = await page.evaluate(
		({ normalContrast, largeContrast }) => {
			type Colour = { red: number; green: number; blue: number; alpha: number };

			// A 1×1 canvas turns any CSS colour (`rgb()`, `oklch()`, `color-mix()`)
			// into the red, green and blue the screen would really show.
			const canvas = document.createElement('canvas');
			canvas.width = 1;
			canvas.height = 1;
			const context = canvas.getContext('2d', { willReadFrequently: true });

			function readColour(cssColour: string): Colour {
				if (!context) throw new Error('No canvas to read colours with.');
				context.clearRect(0, 0, 1, 1);
				context.fillStyle = cssColour;
				context.fillRect(0, 0, 1, 1);
				const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
				return { red, green, blue, alpha: alpha / 255 };
			}

			function blend(top: Colour, bottom: Colour): Colour {
				const mix = (upper: number, lower: number) => upper * top.alpha + lower * (1 - top.alpha);
				return {
					red: mix(top.red, bottom.red),
					green: mix(top.green, bottom.green),
					blue: mix(top.blue, bottom.blue),
					alpha: 1
				};
			}

			function luminance(colour: Colour): number {
				const channel = (value: number) => {
					const fraction = value / 255;
					return fraction <= 0.03928 ? fraction / 12.92 : ((fraction + 0.055) / 1.055) ** 2.4;
				};
				return (
					0.2126 * channel(colour.red) +
					0.7152 * channel(colour.green) +
					0.0722 * channel(colour.blue)
				);
			}

			function contrast(first: Colour, second: Colour): number {
				const lighter = Math.max(luminance(first), luminance(second));
				const darker = Math.min(luminance(first), luminance(second));
				return (lighter + 0.05) / (darker + 0.05);
			}

			/**
			 * The background colour one layer adds, `'unknown'` when it is a photo
			 * or a gradient, or null when it is see-through.
			 */
			function layerColour(layer: Element): Colour | 'unknown' | null {
				if (layer.tagName === 'IMG' || layer.tagName === 'VIDEO') return 'unknown';

				const style = getComputedStyle(layer);
				if (style.backgroundImage !== 'none') return 'unknown';

				const colour = readColour(style.backgroundColor);
				return colour.alpha === 0 ? null : colour;
			}

			/**
			 * What is drawn behind `element` at a point, or null when a photo or a
			 * gradient is in the way and the colour cannot be known.
			 *
			 * The element's own ancestors come first, up to the `<body>`, because
			 * `elementsFromPoint` leaves out anything with `pointer-events: none`,
			 * which a floating toast has. When none of them is solid, whatever
			 * else is drawn under the point is next, so a dark layer laid over a
			 * banner photo counts too.
			 */
			function backgroundAt(element: Element, x: number, y: number): Colour | null {
				const layersFromTop: Colour[] = [];
				const visited = new Set<Element>();
				let isSolid = false;

				for (
					let ancestor: Element | null = element;
					ancestor && ancestor !== document.body && !isSolid;
					ancestor = ancestor.parentElement
				) {
					visited.add(ancestor);
					const colour = layerColour(ancestor);
					if (colour === 'unknown') return null;
					if (colour === null) continue;
					layersFromTop.push(colour);
					isSolid = colour.alpha === 1;
				}

				for (const layer of document.elementsFromPoint(x, y)) {
					if (isSolid) break;
					// Anything inside the element is in front of it, not behind it.
					if (visited.has(layer) || element.contains(layer)) continue;
					const colour = layerColour(layer);
					if (colour === 'unknown') return null;
					if (colour === null) continue;
					layersFromTop.push(colour);
					isSolid = colour.alpha === 1;
				}

				// Paint the layers from the bottom up, starting from white.
				let result: Colour = { red: 255, green: 255, blue: 255, alpha: 1 };
				for (const layer of layersFromTop.reverse()) result = blend(layer, result);
				return result;
			}

			function ownText(element: Element): string {
				let text = '';
				for (const node of element.childNodes) {
					if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
				}
				return text.trim();
			}

			const problems: string[] = [];

			for (const element of document.querySelectorAll('body *')) {
				const text = ownText(element);
				if (text === '') continue;
				if (element.closest(':disabled, [aria-disabled="true"], [aria-hidden="true"]')) continue;

				const style = getComputedStyle(element);
				if (style.visibility !== 'visible' || style.display === 'none') continue;
				// Tailwind's `sr-only` clips an element away rather than hiding it.
				if (style.clipPath !== 'none' || style.clip !== 'auto') continue;

				element.scrollIntoView({ block: 'center', inline: 'center' });
				const box = element.getBoundingClientRect();
				// A visually hidden element, such as a screen-reader-only label.
				if (box.width <= 1 || box.height <= 1) continue;

				const background = backgroundAt(
					element,
					box.left + box.width / 2,
					box.top + box.height / 2
				);
				if (background === null) continue;

				const foreground = blend(readColour(style.color), background);
				const fontSize = parseFloat(style.fontSize);
				const isBold = parseInt(style.fontWeight, 10) >= 700;
				const isLarge = fontSize >= 24 || (isBold && fontSize >= 18.66);
				const required = isLarge ? largeContrast : normalContrast;
				const ratio = contrast(foreground, background);

				if (ratio < required) {
					problems.push(`"${text.slice(0, 40)}" is ${ratio.toFixed(2)}:1, needs ${required}:1`);
				}
			}

			window.scrollTo(0, 0);
			return problems;
		},
		{ normalContrast: NORMAL_TEXT_CONTRAST, largeContrast: LARGE_TEXT_CONTRAST }
	);

	expect(failures, 'This text is too faint against its background.').toEqual([]);
}
