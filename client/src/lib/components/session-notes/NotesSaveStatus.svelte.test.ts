import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import NotesSaveStatus from './NotesSaveStatus.svelte';

describe('NotesSaveStatus', () => {
	it('says when the notes were saved, and tells a screen reader once', () => {
		render(NotesSaveStatus, { props: { status: 'saved', savedAt: Date.now() } });

		expect(screen.getByText('Auto-saved just now').getAttribute('aria-hidden')).toBe('true');
		expect(screen.getByText('Notes saved').getAttribute('aria-live')).toBe('polite');
	});

	it('says "Saving…" while the notes are on their way', () => {
		render(NotesSaveStatus, { props: { status: 'saving', savedAt: null } });

		expect(screen.getAllByText('Saving…')).toHaveLength(2);
	});

	it('says "Not saved" when a save failed', () => {
		render(NotesSaveStatus, { props: { status: 'failed', savedAt: Date.now() } });

		expect(screen.getAllByText('Not saved')).toHaveLength(2);
	});
});
