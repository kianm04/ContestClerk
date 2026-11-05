/**
 * Unit tests in `src/lib` normally run in plain Node, which has no DOM at all.
 * `focusHeadingAfterPress` looks headings up on the page and focuses one, so
 * this file asks Vitest for jsdom, the same fake browser the component tests
 * use, with the comment below. Vitest reads it only at the very top of a file.
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import { focusHeadingAfterPress } from './room-focus';

/** Put a focusable heading with `id` on the page, the way the Room page's cards do. */
function addHeading(id: string): HTMLHeadingElement {
	const heading = document.createElement('h2');
	heading.id = id;
	heading.tabIndex = -1;
	document.body.append(heading);

	return heading;
}

afterEach(() => {
	document.body.replaceChildren();
});

describe('focusHeadingAfterPress', () => {
	it('focuses the first heading of the list that the page shows', async () => {
		addHeading('agenda-heading');
		const openingHeading = addHeading('opening-heading');

		await focusHeadingAfterPress(['opening-heading', 'agenda-heading']);

		expect(document.activeElement).toBe(openingHeading);
	});

	it('skips a heading the page no longer shows', async () => {
		const speakerHeading = addHeading('current-speaker-heading');

		await focusHeadingAfterPress(['opening-heading', 'current-speaker-heading']);

		expect(document.activeElement).toBe(speakerHeading);
	});

	it('leaves the focus where it was when none of the headings is there', async () => {
		const button = document.createElement('button');
		document.body.append(button);
		button.focus();

		await focusHeadingAfterPress(['opening-heading']);

		expect(document.activeElement).toBe(button);
	});
});
