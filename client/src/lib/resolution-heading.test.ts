import { describe, expect, it } from 'vitest';
import type { PaperPerson } from './committee-papers';
import { resolutionBody, resolutionHeading } from './resolution-heading';

function seat(seatName: string, role: PaperPerson['role'], isLead = false): PaperPerson {
	return {
		seatId: seatName,
		seatName,
		countryCode: null,
		holderId: null,
		holderName: null,
		role,
		isLead,
		isMine: false
	};
}

describe('resolutionBody', () => {
	it('speaks as the body a committee belongs to', () => {
		expect(
			resolutionBody({
				name: 'Disarmament and International Security Committee',
				abbreviation: 'DISEC'
			})
		).toBe('General Assembly');
		expect(resolutionBody({ name: 'General Assembly First Committee', abbreviation: null })).toBe(
			'General Assembly'
		);
		expect(resolutionBody({ name: 'Historical Security Council', abbreviation: 'HSC' })).toBe(
			'Security Council'
		);
	});

	it('speaks as the committee itself when the catalogue does not know it', () => {
		expect(resolutionBody({ name: 'Model Arctic Council', abbreviation: 'MAC' })).toBe(
			'Model Arctic Council'
		);
	});
});

describe('resolutionHeading', () => {
	const people = [
		seat('Austria', 'author', true),
		seat('Mexico', 'author'),
		seat('Ghana', 'signatory')
	];

	it('lists the committee, the topic, the sponsors and the signatories', () => {
		const heading = resolutionHeading({
			committee: {
				name: 'Disarmament and International Security Committee',
				abbreviation: 'DISEC'
			},
			topic: 'Lethal autonomous weapons systems',
			people: people.slice(0, 2),
			words: 'sponsors_and_signatories'
		});

		expect(heading).toEqual({
			lines: [
				{ label: 'Committee', value: 'Disarmament and International Security Committee' },
				{ label: 'Topic', value: 'Lethal autonomous weapons systems' },
				{ label: 'Sponsors', value: 'Austria, Mexico' },
				{ label: 'Signatories', value: 'None yet' }
			],
			opening: 'The General Assembly,'
		});
	});

	it('uses THIMUN’s words, and leaves out a topic the paper has none of', () => {
		const heading = resolutionHeading({
			committee: { name: 'Model Arctic Council', abbreviation: null },
			topic: null,
			people,
			words: 'submitters'
		});

		expect(heading.lines).toEqual([
			{ label: 'Committee', value: 'Model Arctic Council' },
			{ label: 'Main submitter', value: 'Austria' },
			{ label: 'Co-submitters', value: 'Mexico, Ghana' }
		]);
	});
});
