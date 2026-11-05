import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import LiveYouNote from './LiveYouNote.svelte';

describe('LiveYouNote', () => {
	it('draws what the room means for the reader in a pale blue box', () => {
		render(LiveYouNote, { props: { text: 'You have the floor' } });

		expect(screen.getByText('You have the floor').className).toContain('bg-brand-50');
	});
});
