import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PlainNotesForm from './PlainNotesForm.svelte';
import { SARAS_NOTES } from './notes-test-data';

const props = {
	action: '?/saveSessionNotes',
	sessionId: 'session-1',
	revision: 4,
	text: '### Opening\n\nGhana **yields**',
	labelledBy: 'notes-heading',
	theirNotes: null,
	onTypedBeforeScript: vi.fn()
};

describe('PlainNotesForm', () => {
	it('posts the Markdown, the session and the revision it started from', () => {
		const { container } = render(PlainNotesForm, { props });

		const form = container.querySelector('form');
		if (form === null) throw new Error('The panel drew no form.');

		expect(form.getAttribute('method')).toBe('post');
		expect(form.getAttribute('action')).toBe('?/saveSessionNotes');
		const sent = new FormData(form);
		expect(Object.fromEntries(sent)).toEqual({
			sessionId: 'session-1',
			revision: '4',
			body: '### Opening\n\nGhana **yields**'
		});
		expect(screen.getByRole('button', { name: 'Save notes' })).toBeTruthy();
	});

	it('does not hand over text nobody typed', () => {
		const onTypedBeforeScript = vi.fn();
		render(PlainNotesForm, { props: { ...props, onTypedBeforeScript } });

		expect(onTypedBeforeScript).not.toHaveBeenCalled();
	});

	it("shows the other chair's notes under the box after a clash", () => {
		render(PlainNotesForm, { props: { ...props, theirNotes: SARAS_NOTES } });

		const theirs = screen.getByRole('region', { name: 'The notes saved by another chair' });
		expect(theirs.querySelector('strong')?.textContent).toBe('yields');
	});
});
