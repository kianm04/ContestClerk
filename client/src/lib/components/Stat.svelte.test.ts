import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import Stat from './Stat.svelte';

describe('Stat', () => {
	it('shows the label and the number', () => {
		render(Stat, { props: { label: 'Applications', value: 128 } });

		expect(screen.getByText('Applications')).toBeTruthy();
		expect(screen.getByText('128')).toBeTruthy();
	});

	it('shows a value that is already written out, such as an amount', () => {
		render(Stat, { props: { label: 'Collected', value: '€1,240.00' } });

		expect(screen.getByText('€1,240.00')).toBeTruthy();
	});

	it('shows the hint only when there is one', () => {
		const withoutHint = render(Stat, { props: { label: 'Seats', value: 33 } });

		expect(withoutHint.container.textContent).not.toContain('12 since Monday');
		withoutHint.unmount();

		render(Stat, { props: { label: 'Seats', value: 33, hint: '12 since Monday' } });

		expect(screen.getByText('12 since Monday')).toBeTruthy();
	});

	it('is a link to the counted work when it is given an address', () => {
		render(Stat, {
			props: {
				label: 'Applications',
				value: 5,
				hint: '1 to review',
				href: '/manage/northbridge/applications' as ResolvedPathname
			}
		});

		const link = screen.getByRole('link', { name: /Applications\s*5\s*1 to review/ });
		expect(link.getAttribute('href')).toBe('/manage/northbridge/applications');
	});

	it('is not a link without an address', () => {
		render(Stat, { props: { label: 'Seats', value: 33 } });

		expect(screen.queryByRole('link')).toBeNull();
	});
});
