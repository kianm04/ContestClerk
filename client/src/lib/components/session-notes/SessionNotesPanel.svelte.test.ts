import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import SessionNotesPanel from './SessionNotesPanel.svelte';
import { SARAS_NOTES } from './notes-test-data';

/*
	`beforeNavigate` only works inside a running SvelteKit app. The panel's
	leaving rules are proven in the browser tests; here it does nothing.
*/
vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn() }));

const props = {
	sessionId: 'session-1',
	notes: SARAS_NOTES,
	draftText: null,
	readerId: 'me'
};

describe('SessionNotesPanel', () => {
	it('swaps the plain box for the Markdown editor once its script runs', async () => {
		render(SessionNotesPanel, { props });
		// The editor starts in an `$effect`, just after the first drawing.
		await tick();

		expect(screen.getByRole('region', { name: 'Chair Notes' })).toBeTruthy();
		expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeTruthy();
		const writingArea = screen.getByRole('textbox', { name: 'Chair Notes' });
		expect(writingArea.querySelector('strong')?.textContent).toBe('yields');
		expect(screen.queryByRole('button', { name: 'Save notes' })).toBeNull();
		expect(screen.getByText(/^Auto-saved/)).toBeTruthy();
	});

	it('says nothing about saving before any notes are written', async () => {
		render(SessionNotesPanel, { props: { ...props, notes: null } });
		await tick();

		expect(screen.queryByText(/^Auto-saved/)).toBeNull();
		expect(screen.getByText('Write your notes here…')).toBeTruthy();
	});
});
