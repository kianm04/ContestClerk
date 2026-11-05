import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Avatar from './Avatar.svelte';

describe('Avatar', () => {
	it('shows the initials when there is no picture', () => {
		render(Avatar, { props: { name: 'Daniel Perez', size: 'md' } });

		expect(screen.getByText('DP')).toBeTruthy();
	});

	it('reads out the whole name rather than the two letters', () => {
		render(Avatar, { props: { name: 'Daniel Perez', size: 'md' } });

		expect(screen.getByRole('img', { name: 'Daniel Perez' })).toBeTruthy();
	});

	it('shows the picture when there is one, with the name as its alt text', () => {
		render(Avatar, {
			props: { name: 'Daniel Perez', imagePath: 'avatars/7f3c/a1.jpg', size: 'sm' }
		});

		const image = screen.getByRole('img', { name: 'Daniel Perez' });

		expect(image.getAttribute('src')).toContain('avatars/7f3c/a1.jpg');
	});

	it('is larger at the large size', () => {
		render(Avatar, { props: { name: 'Daniel Perez', size: 'lg' } });

		expect(screen.getByRole('img', { name: 'Daniel Perez' }).className).toContain('h-16');
	});
});
