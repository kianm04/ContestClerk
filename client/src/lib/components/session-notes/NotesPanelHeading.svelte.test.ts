import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import NotesPanelHeading from './NotesPanelHeading.svelte';

// A stand-in for the save status the panel writes between the heading's tags.
const status = createRawSnippet(() => ({ render: () => '<p>Auto-saved just now</p>' }));

describe('NotesPanelHeading', () => {
	it('names the panel and shows what was written inside it', () => {
		render(NotesPanelHeading, { props: { headingId: 'notes-heading', children: status } });

		const heading = screen.getByRole('heading', { name: 'Chair Notes', level: 2 });
		expect(heading.getAttribute('id')).toBe('notes-heading');
		expect(screen.getByText('Keep track of key points, arguments, and decisions.')).toBeTruthy();
		expect(screen.getByText('Auto-saved just now')).toBeTruthy();
	});
});
