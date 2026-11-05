import { describe, expect, it } from 'vitest';
import {
	CLOSING_CALL,
	DELEGATE_LINK,
	DELEGATE_PITCH,
	JOURNEY_STEPS,
	LANDING_QUESTIONS,
	ORGANISER_LINK,
	ORGANISER_PITCH,
	SAMPLE_APPLICANTS,
	SAMPLE_MY_APPLICATIONS,
	SCHOOL_STEPS
} from './landing';

// The copy on the landing page. The words and the links are checked here
// rather than in a component test, because where each link leads is the point
// of the page and none of it needs a rendered page to be read.

describe('DELEGATE_PITCH', () => {
	it('speaks to delegates with the heading of the mockup', () => {
		expect(DELEGATE_PITCH.eyebrow).toBe('For delegates');
		expect(DELEGATE_PITCH.headingLines.join(' ')).toBe('Join conferences that shape you.');
	});

	it('sends delegates to the conference directory', () => {
		expect(DELEGATE_PITCH.link).toEqual({
			href: '/conferences',
			label: 'Explore conferences'
		});
	});
});

describe('ORGANISER_PITCH', () => {
	it('speaks to organisers with the heading of the mockup', () => {
		expect(ORGANISER_PITCH.eyebrow).toBe('For organisers');
		expect(ORGANISER_PITCH.headingLines.join(' ')).toBe('Create conferences that make an impact.');
	});

	it('sends organisers through sign up to the form for a new conference', () => {
		// Only a visitor sees the landing page, so the button cannot go
		// straight to `/create`, which needs an account.
		expect(ORGANISER_PITCH.link).toEqual({
			href: '/register?next=%2Fcreate',
			label: 'Create a conference'
		});
	});
});

describe('JOURNEY_STEPS', () => {
	it('runs from publishing a conference to chairing it, in six steps', () => {
		expect(JOURNEY_STEPS.map((step) => step.title)).toEqual([
			'Publish',
			'Apply',
			'Review',
			'Allocate',
			'Pay',
			'Chair'
		]);
	});
});

describe('the audience links', () => {
	it('send delegates to the directory and organisers to their tour', () => {
		expect(DELEGATE_LINK.href).toBe('/conferences');
		expect(ORGANISER_LINK.href).toBe('/for-organisers');
	});
});

describe('SCHOOL_STEPS', () => {
	it('has the three things a school does, in order', () => {
		expect(SCHOOL_STEPS.map((step) => step.title)).toEqual([
			'Register a delegation',
			'Invite students with a code',
			'Assign the seats you are allocated'
		]);
	});
});

describe('SAMPLE_MY_APPLICATIONS', () => {
	it('shows a delegate one application in each state', () => {
		expect(SAMPLE_MY_APPLICATIONS.map((application) => application.status)).toEqual([
			'Accepted',
			'Pending',
			'Waitlisted'
		]);
	});
});

describe('SAMPLE_APPLICANTS', () => {
	it('shows every status word the table can draw', () => {
		const statuses = new Set(SAMPLE_APPLICANTS.map((applicant) => applicant.status));

		expect(statuses).toEqual(new Set(['Accepted', 'Pending', 'Waitlisted']));
	});
});

describe('LANDING_QUESTIONS', () => {
	it('answers the question of cost first', () => {
		expect(LANDING_QUESTIONS[0].question).toBe('What does it cost?');
		expect(LANDING_QUESTIONS[0].answer).toContain('€2.00');
	});
});

describe('CLOSING_CALL', () => {
	it('ends the page with one button to sign up', () => {
		expect(CLOSING_CALL.heading).toBe('Ready to be part of something bigger?');
		expect(CLOSING_CALL.link).toEqual({ href: '/register', label: 'Get started' });
	});
});
