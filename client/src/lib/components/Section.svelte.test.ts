import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Calendar from '@lucide/svelte/icons/calendar';
import Section from './Section.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>Three events today</p>' }));

describe('Section', () => {
	it('shows the title and what is inside it', () => {
		render(Section, { props: { title: 'Your schedule', children } });

		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Your schedule');
		expect(screen.getByText('Three events today')).toBeTruthy();
	});

	it('is a landmark a screen reader can jump to, named after its title', () => {
		render(Section, { props: { title: 'Your schedule', children } });

		expect(screen.getByRole('region', { name: 'Your schedule' })).toBeTruthy();
	});

	it('shows no "View all" link without a link to go to', () => {
		render(Section, { props: { title: 'Your schedule', children } });

		expect(screen.queryByRole('link')).toBeNull();
	});

	it('shows the "View all" link with the words the page chose', () => {
		render(Section, {
			props: {
				title: 'Your schedule',
				viewAllHref: '/conferences',
				viewAllLabel: 'Open the schedule',
				children
			}
		});

		const link = screen.getByRole('link');

		expect(link.getAttribute('href')).toBe('/conferences');
		expect(link.textContent).toContain('Open the schedule');
	});

	it('draws a conference logo beside the title, as its initials when there is no picture', () => {
		render(Section, {
			props: {
				title: 'Northbridge MUN',
				logo: { name: 'Northbridge MUN', imagePath: null },
				children
			}
		});

		const logo = screen.getByRole('img', { name: 'Northbridge MUN' });
		expect(logo.textContent?.trim()).toBe('NM');
	});

	it('draws the icon it is given', () => {
		const { container } = render(Section, {
			props: { title: 'Your schedule', icon: Calendar, children }
		});

		expect(container.querySelector('svg')).toBeTruthy();
	});
});
