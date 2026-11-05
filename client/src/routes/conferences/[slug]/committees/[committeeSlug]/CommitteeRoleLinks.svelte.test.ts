import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { chairRoomUrl, committeeLiveUrl, committeePapersUrl, crisisDeskUrl } from '$lib/urls';
import CommitteeRoleLinks from './CommitteeRoleLinks.svelte';

/** The props of a signed-in reader with no role here, with `overrides` on top. */
function propsFor(
	overrides: Partial<{
		mySeatId: string;
		isChair: boolean;
		canManage: boolean;
		papersTitle: string;
		isCrisisStaff: boolean;
	}>
) {
	return {
		conferenceSlug: 'thimun-2027',
		committeeId: 'committee-1',
		committeeSlug: 'unsc',
		papersTitle: 'Resolutions',
		mySeatId: null,
		positionPaperRequired: false,
		myPaperStatus: null,
		isChair: false,
		canManage: false,
		isCrisisStaff: false,
		...overrides
	};
}

/**
 * The names of the links drawn filled, in page order. A filled button carries
 * the brand colour (`$lib/button-classes.ts`), as the chair room's tests check too.
 */
function filledLinkNames(): string[] {
	const links = screen.getAllByRole('link');
	const filledLinks = links.filter((link) => link.className.includes('bg-primary'));

	return filledLinks.map((link) => link.textContent?.trim() ?? '');
}

describe('CommitteeRoleLinks', () => {
	it('opens the live room for a delegate, the chair and an organiser', () => {
		for (const role of [{ mySeatId: 'seat-fr' }, { isChair: true }, { canManage: true }]) {
			const { unmount } = render(CommitteeRoleLinks, { props: propsFor(role) });

			const link = screen.getByRole('link', { name: 'Open live room' });
			expect(link.getAttribute('href')).toBe(committeeLiveUrl('thimun-2027', 'unsc'));
			unmount();
		}
	});

	it("links everybody who may follow the room to the committee's papers, by the committee's word for them", () => {
		for (const role of [{ mySeatId: 'seat-fr' }, { isChair: true }, { canManage: true }]) {
			const { unmount } = render(CommitteeRoleLinks, { props: propsFor(role) });

			const link = screen.getByRole('link', { name: 'Resolutions' });
			expect(link.getAttribute('href')).toBe(committeePapersUrl('thimun-2027', 'unsc'));
			unmount();
		}

		render(CommitteeRoleLinks, {
			props: propsFor({ mySeatId: 'seat-fr', papersTitle: 'Directives' })
		});
		expect(screen.getByRole('link', { name: 'Directives' })).toBeTruthy();
	});

	it('shows a reader with no role here no links at all', () => {
		render(CommitteeRoleLinks, { props: propsFor({}) });

		expect(screen.queryByRole('link')).toBeNull();
	});

	it('makes "Open chair room" the one filled button for a chair, first in the row', () => {
		render(CommitteeRoleLinks, { props: propsFor({ isChair: true }) });

		const links = screen.getAllByRole('link').map((link) => link.textContent?.trim());
		expect(links).toEqual(['Open chair room', 'Open live room', 'Resolutions']);
		expect(filledLinkNames()).toEqual(['Open chair room']);
		expect(screen.getByRole('link', { name: 'Open chair room' }).getAttribute('href')).toBe(
			chairRoomUrl('thimun-2027', 'unsc')
		);
	});

	it('makes "Open chair room" the filled one for an organiser, with the editor outlined', () => {
		render(CommitteeRoleLinks, { props: propsFor({ isChair: true, canManage: true }) });

		expect(filledLinkNames()).toEqual(['Open chair room']);
		expect(screen.getByRole('link', { name: 'Edit committee' })).toBeTruthy();
	});

	it('keeps "Open live room" the filled one for a delegate, who has no chair room', () => {
		render(CommitteeRoleLinks, { props: propsFor({ mySeatId: 'seat-fr' }) });

		expect(filledLinkNames()).toEqual(['Open live room']);
		expect(screen.queryByRole('link', { name: 'Open chair room' })).toBeNull();
	});

	it('makes "Answer directives" the filled one for the crisis staff, who need no seat', () => {
		render(CommitteeRoleLinks, { props: propsFor({ isCrisisStaff: true }) });

		const links = screen.getAllByRole('link').map((link) => link.textContent?.trim());
		expect(links).toEqual(['Answer directives']);
		expect(filledLinkNames()).toEqual(['Answer directives']);
		expect(screen.getByRole('link', { name: 'Answer directives' }).getAttribute('href')).toBe(
			crisisDeskUrl('thimun-2027', 'unsc')
		);
	});

	it('keeps "Open chair room" the filled one for a chair who also answers directives', () => {
		render(CommitteeRoleLinks, { props: propsFor({ isChair: true, isCrisisStaff: true }) });

		const links = screen.getAllByRole('link').map((link) => link.textContent?.trim());
		expect(links).toEqual([
			'Open chair room',
			'Answer directives',
			'Open live room',
			'Resolutions'
		]);
		expect(filledLinkNames()).toEqual(['Open chair room']);
	});

	it('never says "Chair tools"', () => {
		render(CommitteeRoleLinks, { props: propsFor({ isChair: true, canManage: true }) });

		expect(screen.queryByText('Chair tools')).toBeNull();
	});
});
