import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import ActionRow from './ActionRow.svelte';

/*
	`createRawSnippet` builds the markup a page would write between `<ActionRow>`
	and `</ActionRow>`, so the test can hand the component its `children` prop.
	It is the only way to pass a snippet from plain TypeScript.
*/
const children = createRawSnippet(() => ({
	render: () => '<a href="/manage/model-un/applications">Review applications</a>'
}));

describe('ActionRow', () => {
	it('is a list item with the title, the detail and the action', () => {
		render(ActionRow, {
			props: {
				title: '4 applications are waiting for a decision',
				detail: 'The oldest came in 6 days ago.',
				children
			}
		});

		const row = screen.getByRole('listitem');

		expect(row.textContent).toContain('4 applications are waiting for a decision');
		expect(row.textContent).toContain('The oldest came in 6 days ago.');
		expect(screen.getByRole('link', { name: 'Review applications' })).toBeTruthy();
	});

	it('leaves the detail line out when there is none', () => {
		const { container } = render(ActionRow, { props: { title: 'Publish Draft Conference' } });

		expect(container.querySelectorAll('p')).toHaveLength(1);
	});

	it('wraps the action under the text on a phone, right-aligned, and keeps it beside from sm up', () => {
		render(ActionRow, { props: { title: 'Submit position paper (UNHRC)', children } });

		const row = screen.getByRole('listitem');
		const slot = screen.getByRole('link').parentElement;

		// The row may only wrap below `sm`: on a desktop the action stays beside a long title.
		expect(row.className).toContain('max-sm:flex-wrap');
		expect(slot?.className).toContain('max-sm:basis-full');
		expect(slot?.className).toContain('max-sm:justify-end');
	});

	it('draws no slot at all when given no action', () => {
		render(ActionRow, { props: { title: 'Nothing to press' } });

		expect(screen.getByRole('listitem').children).toHaveLength(1);
	});
});
