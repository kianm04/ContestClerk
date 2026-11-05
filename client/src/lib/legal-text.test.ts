import { describe, expect, it } from 'vitest';
import {
	PRIVACY_LAST_UPDATED,
	PRIVACY_SECTIONS,
	TERMS_LAST_UPDATED,
	TERMS_SECTIONS,
	type LegalSection
} from './legal-text';

// The two legal documents. The prose itself is placeholder text that a lawyer
// will rewrite (`specs/07-delivery/open-questions.md` #12), so these tests check
// the things that must stay true however the words change: that every section
// the spec names is there, in the right order, and that the contents list down
// the side of the page can link to each of them.

/** An anchor a browser can jump to: lower-case letters and hyphens, nothing else. */
const SECTION_ID_PATTERN = /^[a-z-]+$/;

/** The headings of a document, in the order a reader meets them. */
function headingsOf(sections: LegalSection[]): string[] {
	return sections.map((section) => section.heading);
}

/**
 * The checks that hold for any legal document, so that both can be put through
 * the same ones. Each `it` below says which document it is talking about.
 */
function expectEverySectionCanBeLinkedTo(sections: LegalSection[]): void {
	const ids = sections.map((section) => section.id);
	const uniqueIds = new Set(ids);

	expect(uniqueIds.size).toBe(ids.length);

	for (const id of ids) {
		expect(SECTION_ID_PATTERN.test(id)).toBe(true);
	}
}

/** No heading with nothing under it, and no blank paragraph in between. */
function expectNoSectionIsEmpty(sections: LegalSection[]): void {
	for (const section of sections) {
		expect(section.heading).not.toBe('');
		expect(section.paragraphs.length).toBeGreaterThan(0);

		for (const paragraph of section.paragraphs) {
			expect(paragraph.trim()).not.toBe('');
		}
	}
}

/** The one section of a document with this heading. */
function sectionHeaded(sections: LegalSection[], heading: string): LegalSection {
	const found = sections.find((section) => section.heading === heading);

	// Fail here rather than further down with "cannot read property of
	// undefined", which says nothing about what went wrong.
	expect(found).toBeTruthy();

	return found as LegalSection;
}

describe('TERMS_SECTIONS', () => {
	it('has the eleven sections of the spec, in reading order', () => {
		expect(headingsOf(TERMS_SECTIONS)).toEqual([
			'Who we are',
			'Accounts',
			'Organisers and conferences',
			'Fees',
			'Payments and refunds',
			'Content you upload',
			'Acceptable use',
			'Termination',
			'Liability',
			'Changes',
			'Contact'
		]);
	});

	it('gives every section an anchor the contents list can point at', () => {
		expectEverySectionCanBeLinkedTo(TERMS_SECTIONS);
	});

	it('leaves no section without words in it', () => {
		expectNoSectionIsEmpty(TERMS_SECTIONS);
	});

	it('says in its first section that the text is waiting for a lawyer', () => {
		const opening = TERMS_SECTIONS[0];

		expect(opening.heading).toBe('Who we are');
		expect(opening.paragraphs[0]).toContain('placeholder');
		expect(opening.paragraphs[0]).toContain('lawyer');
	});

	it('states the minimum age and where somebody younger joins from', () => {
		const accounts = sectionHeaded(TERMS_SECTIONS, 'Accounts');
		const text = accounts.paragraphs.join(' ');

		expect(text).toContain('at least 13');
		expect(text).toContain('under 16');
		expect(text).toContain('school');
	});

	it('says the organiser is the merchant and MUNMeet is the platform', () => {
		const organisers = sectionHeaded(TERMS_SECTIONS, 'Organisers and conferences');
		const text = organisers.paragraphs.join(' ');

		expect(text).toContain('merchant');
		expect(text).toContain('platform');
	});

	it('says a conference that charges nothing pays us nothing, and that the fee can change', () => {
		const fees = sectionHeaded(TERMS_SECTIONS, 'Fees');
		const text = fees.paragraphs.join(' ');

		expect(text).toContain('A conference that charges no fees pays us nothing');
		expect(text).toContain('we tell organisers first');
	});

	it('puts refunds between the organiser and the delegate, with Stripe on the payment', () => {
		const refunds = sectionHeaded(TERMS_SECTIONS, 'Payments and refunds');
		const text = refunds.paragraphs.join(' ');

		expect(text).toContain('Refunds are between you and the conference organisers');
		expect(text).toContain('Stripe');
	});

	it('gives our address in the last section', () => {
		const contact = sectionHeaded(TERMS_SECTIONS, 'Contact');

		expect(contact.paragraphs.join(' ')).toContain('hello@munmeet.app');
	});
});

describe('PRIVACY_SECTIONS', () => {
	it('has the eight sections of the spec, in reading order', () => {
		expect(headingsOf(PRIVACY_SECTIONS)).toEqual([
			'What we collect',
			'Why',
			'Who sees it',
			'Where it is stored',
			'How long',
			'Your rights',
			'Cookies',
			'Contact'
		]);
	});

	it('gives every section an anchor the contents list can point at', () => {
		expectEverySectionCanBeLinkedTo(PRIVACY_SECTIONS);
	});

	it('leaves no section without words in it', () => {
		expectNoSectionIsEmpty(PRIVACY_SECTIONS);
	});

	it('says in its first section that the text is waiting for a lawyer', () => {
		const opening = PRIVACY_SECTIONS[0];

		expect(opening.heading).toBe('What we collect');
		expect(opening.paragraphs[0]).toContain('placeholder');
		expect(opening.paragraphs[0]).toContain('lawyer');
	});

	it('names the private details the app really keeps', () => {
		// The fields of `profile_details` in
		// `specs/02-architecture/data-model.md`, in plain words.
		const collected = sectionHeaded(PRIVACY_SECTIONS, 'What we collect');
		const text = collected.paragraphs.join(' ');

		expect(text).toContain('email address');
		expect(text).toContain('date of birth');
		expect(text).toContain('phone number');
		expect(text).toContain('dietary requirements');
		expect(text).toContain('emergency contact');
	});

	it('says application answers and uploads are kept but card numbers are not', () => {
		const collected = sectionHeaded(PRIVACY_SECTIONS, 'What we collect');
		const text = collected.paragraphs.join(' ');

		expect(text).toContain('answers you write in an application');
		expect(text).toContain('position paper');
		expect(text).toContain('never keep your card number');
	});

	it('gives one reason for collecting any of it', () => {
		const why = sectionHeaded(PRIVACY_SECTIONS, 'Why');

		expect(why.paragraphs[0]).toContain('to run the conference you applied to');
	});

	it('lists the four audiences of the "Who sees it" table', () => {
		const whoSeesIt = sectionHeaded(PRIVACY_SECTIONS, 'Who sees it');

		expect(whoSeesIt.table?.columns).toEqual(['Who', 'What they see']);
		expect(whoSeesIt.table?.rows).toHaveLength(4);
		expect(whoSeesIt.table?.rows.map((row) => row.who)).toEqual([
			'Organisers of a conference you applied to',
			'Chairs of your committee',
			'The head of your delegation',
			'Other participants, and anyone else signed in'
		]);
	});

	it('does not promise that a stranger sees less of your profile than they do', () => {
		// The `profiles` row of the policy matrix in
		// `specs/02-architecture/permissions.md` gives select to every signed-in
		// account, for the whole public profile, with no conference in common
		// needed. A privacy policy claiming otherwise would be the one kind of
		// wrong that matters most here, so the last row says so and promises
		// only that the private details stay out of it.
		const whoSeesIt = sectionHeaded(PRIVACY_SECTIONS, 'Who sees it');
		const others = whoSeesIt.table?.rows.at(-1);

		expect(others?.who).toContain('anyone else signed in');
		expect(others?.sees).toContain('Your public profile');
		expect(others?.sees).toContain('Never your private details');
		expect(others?.sees).not.toContain('Nothing else');
	});

	it('says in its own words that any signed-in account can read a public profile', () => {
		const whoSeesIt = sectionHeaded(PRIVACY_SECTIONS, 'Who sees it');
		const collected = sectionHeaded(PRIVACY_SECTIONS, 'What we collect');

		expect(whoSeesIt.paragraphs.join(' ')).toContain('anyone signed in to MUNMeet can read it');
		expect(collected.paragraphs.join(' ')).toContain('Anyone signed in to MUNMeet can see that');
	});

	it('says where the data sits and who else touches it', () => {
		const stored = sectionHeaded(PRIVACY_SECTIONS, 'Where it is stored');
		const text = stored.paragraphs.join(' ');

		expect(text).toContain('Supabase');
		expect(text).toContain('European Union');
		expect(text).toContain('Stripe');
	});

	it('says how long an account is kept for', () => {
		const howLong = sectionHeaded(PRIVACY_SECTIONS, 'How long');
		const text = howLong.paragraphs.join(' ');

		expect(text).toContain('until you delete it');
		expect(text).toContain('three years');
	});

	it('sends somebody exercising their rights to their settings page', () => {
		const rights = sectionHeaded(PRIVACY_SECTIONS, 'Your rights');
		const text = rights.paragraphs.join(' ');

		expect(rights.link?.href).toBe('/settings');
		expect(text).toContain('correct it and delete it');
	});

	it('says there is nothing tracking the reader', () => {
		const cookies = sectionHeaded(PRIVACY_SECTIONS, 'Cookies');
		const text = cookies.paragraphs.join(' ');

		expect(text).toContain('keeps you signed in');
		expect(text).toContain('no analytics');
	});

	it('gives our address in the last section', () => {
		const contact = sectionHeaded(PRIVACY_SECTIONS, 'Contact');

		expect(contact.paragraphs.join(' ')).toContain('hello@munmeet.app');
	});
});

describe('TERMS_LAST_UPDATED and PRIVACY_LAST_UPDATED', () => {
	it('are written out the way the page shows them', () => {
		// The day the prose below it was written, not the day the MVP scope was
		// decided. `legal-text.ts` says why the two differ.
		expect(TERMS_LAST_UPDATED).toBe('17 September 2026');
		expect(PRIVACY_LAST_UPDATED).toBe('17 September 2026');
	});
});
