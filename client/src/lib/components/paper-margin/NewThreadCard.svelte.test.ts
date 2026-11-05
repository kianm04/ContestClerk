import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import NewThreadCard from './NewThreadCard.svelte';

describe('NewThreadCard', () => {
	it('without JavaScript, comments on the whole paper and has nothing to cancel', () => {
		render(NewThreadCard, {});

		const field = screen.getByRole('textbox', { name: 'Comment on the whole paper' });
		expect(field.closest('form')?.getAttribute('action')).toBe('?/startThread');
		expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
	});

	it('opened by "Comment", is written in at once and can be cancelled', () => {
		const onDone = vi.fn();
		render(NewThreadCard, { passage: () => null, onDone });

		expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'New comment' }));
		screen.getByRole('button', { name: 'Cancel' }).click();
		expect(onDone).toHaveBeenCalled();
	});
});
