import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { PRIVACY_SECTIONS, type LegalSection } from '$lib/legal-text';
import LegalPage from './LegalPage.svelte';

const sections: LegalSection[] = [
	{
		id: 'what-we-collect',
		heading: 'What we collect',
		paragraphs: [
			'Your name, your email address and the answers you give on an application.',
			'We keep whether an invoice is paid. We never keep card numbers.'
		]
	},
	{
		id: 'who-sees-it',
		heading: 'Who sees it',
		paragraphs: ['Only the people running the conference you applied to.'],
		table: {
			columns: ['Who', 'What they see'],
			rows: [
				{ who: 'Organisers', sees: 'Your profile and your answers.' },
				{ who: 'Other participants', sees: 'Your name and your seat.' }
			]
		}
	}
];

/** Render the component with the two sections above, the way both pages use it. */
function renderLegalPage() {
	return render(LegalPage, {
		props: { title: 'Privacy policy', lastUpdated: '15 September 2026', sections }
	});
}

describe('LegalPage', () => {
	it('shows the name of the document as the page heading', () => {
		renderLegalPage();

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Privacy policy');
	});

	it('says when the document last changed', () => {
		renderLegalPage();

		expect(screen.getByText('Last updated 15 September 2026')).toBeTruthy();
	});

	it('gives every section a heading with the id the contents list points at', () => {
		const { container } = renderLegalPage();
		const headings = [...container.querySelectorAll('h2')];

		expect(headings.map((heading) => heading.textContent)).toEqual([
			'What we collect',
			'Who sees it'
		]);
		expect(headings.map((heading) => heading.id)).toEqual(['what-we-collect', 'who-sees-it']);
	});

	it('lists one anchor per section, so the contents work without JavaScript', () => {
		const { container } = renderLegalPage();
		const contents = container.querySelector('nav[aria-label="Contents"]');
		const links = [...(contents?.querySelectorAll('a') ?? [])];

		expect(links).toHaveLength(2);
		expect(links.map((link) => link.getAttribute('href'))).toEqual([
			'#what-we-collect',
			'#who-sees-it'
		]);
		expect(links.map((link) => link.textContent?.trim())).toEqual([
			'What we collect',
			'Who sees it'
		]);
	});

	it('keeps the prose to a readable width', () => {
		const { container } = renderLegalPage();

		expect(container.querySelector('article')?.className.includes('max-w-prose')).toBe(true);
	});

	it('sets every section heading in the display face', () => {
		const { container } = renderLegalPage();

		// `03-design/design-system.md` gives a section title `font-display` and
		// `text-h2`. The font does not come along with the size token, so the
		// markup has to name both.
		for (const heading of container.querySelectorAll('h2')) {
			expect(heading.className).toContain('font-display');
			expect(heading.className).toContain('text-h2');
		}
	});

	it('shows the paragraphs of every section', () => {
		renderLegalPage();

		const paid = 'We keep whether an invoice is paid. We never keep card numbers.';

		expect(screen.getByText(paid)).toBeTruthy();
		expect(screen.getByText('Only the people running the conference you applied to.')).toBeTruthy();
	});

	it('draws the table of a section that has one, with a heading on each column', () => {
		renderLegalPage();

		const columnHeadings = screen.getAllByRole('columnheader');

		expect(columnHeadings.map((heading) => heading.textContent?.trim())).toEqual([
			'Who',
			'What they see'
		]);
		expect(screen.getByText('Other participants')).toBeTruthy();
		expect(screen.getByText('Your name and your seat.')).toBeTruthy();
	});

	it('shows the link of a section that has one, in the prose rather than the contents', () => {
		// The "Your rights" section of the real privacy policy is the only section
		// in either document with a link, so it is borrowed here rather than
		// invented: a `href` has to be a `ResolvedPathname` from `resolve()`,
		// which only `legal-text.ts` builds.
		const sectionWithLink = PRIVACY_SECTIONS.find((section) => section.link !== undefined);

		// Fail here rather than further down with "cannot read property of
		// undefined", which would say nothing about what went wrong.
		expect(sectionWithLink).toBeTruthy();

		const rights = sectionWithLink as LegalSection;

		const { container } = render(LegalPage, {
			props: { title: 'Privacy policy', lastUpdated: '17 September 2026', sections: [rights] }
		});

		// The contents list down the side is nothing but anchors, so the one
		// being looked for is the one inside `<article>`.
		const proseLinks = [...(container.querySelector('article')?.querySelectorAll('a') ?? [])];

		expect(proseLinks).toHaveLength(1);
		expect(proseLinks[0].textContent?.trim()).toBe(rights.link?.label);
		expect(proseLinks[0].getAttribute('href')).toBe(rights.link?.href);
	});

	it('draws no link for a section without one', () => {
		const { container } = renderLegalPage();

		expect(container.querySelector('article')?.querySelectorAll('a')).toHaveLength(0);
	});

	it('draws no table for a section without one', () => {
		const { container } = render(LegalPage, {
			props: {
				title: 'Terms of service',
				lastUpdated: '15 September 2026',
				sections: [sections[0]]
			}
		});

		expect(container.querySelectorAll('table')).toHaveLength(0);
	});
});
