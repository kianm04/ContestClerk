import { describe, expect, it } from 'vitest';
import type { Award } from './awards';
import { organiserAwardMenu, type AwardMenuContext } from './organiser-award-menu';

/** A confirmed custom award, held by the delegate of France. */
const AWARD: Award = {
	id: 'award-1',
	committeeId: 'committee-unsc',
	seatId: 'seat-france',
	seatName: 'France',
	countryCode: 'FR',
	holderName: 'Amélie Laurent',
	isSeatEmpty: false,
	kind: 'custom',
	title: 'Spirit of the Conference',
	status: 'confirmed',
	createdBy: 'user-organiser',
	proposerName: 'Olga Organiser'
};

/** An organiser who added the award, before anything is published. */
const CONTEXT: AwardMenuContext = {
	slug: 'thimun-2027',
	isPublished: false,
	canRename: true,
	isRenaming: false
};

describe('organiserAwardMenu', () => {
	it('offers to unconfirm a confirmed award and to rename it', () => {
		const labels = organiserAwardMenu(AWARD, CONTEXT).map((item) => item.label);

		expect(labels).toEqual(['Unconfirm', 'Edit title']);
	});

	it('posts the award id to the unconfirm action', () => {
		const [unconfirm] = organiserAwardMenu(AWARD, CONTEXT);

		expect(unconfirm).toMatchObject({
			formaction: '?/unconfirm',
			name: 'awardId',
			value: 'award-1'
		});
	});

	it('links "Edit title" to the page with that award open', () => {
		const editTitle = organiserAwardMenu(AWARD, CONTEXT)[1];

		expect(editTitle.href).toBe('/manage/thimun-2027/awards?edit=award-1');
	});

	it('leaves out what does not apply', () => {
		const proposal = { ...AWARD, status: 'proposed' as const };
		const notTheirs = { ...CONTEXT, canRename: false };
		const alreadyOpen = { ...CONTEXT, isRenaming: true };

		expect(organiserAwardMenu(proposal, notTheirs)).toEqual([]);
		expect(organiserAwardMenu(AWARD, alreadyOpen).map((item) => item.label)).toEqual(['Unconfirm']);
	});

	it('is empty once the awards are published', () => {
		expect(organiserAwardMenu(AWARD, { ...CONTEXT, isPublished: true })).toEqual([]);
	});
});
