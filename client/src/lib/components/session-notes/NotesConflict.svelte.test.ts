import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import NotesConflict from './NotesConflict.svelte';
import { SARAS_NOTES } from './notes-test-data';

describe('NotesConflict', () => {
	it('names the chair who saved first and keeps their notes behind "See their version"', () => {
		render(NotesConflict, {
			props: { theirNotes: SARAS_NOTES, readerId: 'me', onKeepMine: vi.fn(), onUseTheirs: vi.fn() }
		});

		expect(screen.getByText('Sara changed these notes.')).toBeTruthy();
		expect(screen.getByText('See their version')).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Opening', hidden: true })).toBeTruthy();
	});

	it("hands the chair's choice back to the panel", async () => {
		const onKeepMine = vi.fn();
		const onUseTheirs = vi.fn();
		render(NotesConflict, {
			props: { theirNotes: SARAS_NOTES, readerId: 'me', onKeepMine, onUseTheirs }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Use theirs' }));

		expect(onKeepMine).toHaveBeenCalledOnce();
		expect(onUseTheirs).toHaveBeenCalledOnce();
	});
});
