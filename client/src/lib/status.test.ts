import { describe, expect, it } from 'vitest';
import { statusBadgeTone, statusLabel } from './status';

describe('statusLabel', () => {
	it('gives the words from the writing style guide', () => {
		expect(statusLabel('application_status', 'submitted')).toBe('Under review');
		expect(statusLabel('application_status', 'rejected')).toBe('Not accepted');
		expect(statusLabel('invoice_status', 'void')).toBe('Cancelled');
		expect(statusLabel('review_status', 'changes_requested')).toBe('Changes requested');
	});

	it('words the same value differently in different enums', () => {
		// This is why both helpers ask for the enum name first.
		expect(statusLabel('application_status', 'draft')).toBe('Draft');
		expect(statusLabel('conference_status', 'draft')).toBe('Draft');
		expect(statusLabel('application_status', 'submitted')).toBe('Under review');
		expect(statusLabel('review_status', 'submitted')).toBe('Awaiting review');
	});

	it('never shows a database code to a person', () => {
		expect(statusLabel('attendance_status', 'present_and_voting')).toBe('Present and voting');
		expect(statusLabel('motion_kind', 'unmoderated_caucus')).toBe('Unmoderated caucus');
		expect(statusLabel('question_type', 'short_text')).toBe('Short answer');
	});

	it('uses British spelling', () => {
		expect(statusLabel('award_kind', 'honourable_mention')).toBe('Honourable mention');
		expect(statusLabel('organization_role', 'owner')).toBe('Owner');
	});
});

describe('statusBadgeTone', () => {
	it('gives the tone from the writing style guide', () => {
		expect(statusBadgeTone('application_status', 'accepted')).toBe('success');
		expect(statusBadgeTone('application_status', 'waitlisted')).toBe('warning');
		expect(statusBadgeTone('application_status', 'rejected')).toBe('danger');
		expect(statusBadgeTone('application_status', 'withdrawn')).toBe('neutral');
	});

	it('marks a vote choice by what it means, not by its wording', () => {
		expect(statusBadgeTone('vote_choice', 'for')).toBe('success');
		expect(statusBadgeTone('vote_choice', 'against')).toBe('danger');
		expect(statusBadgeTone('vote_choice', 'abstain')).toBe('neutral');
	});

	it('gives an unpaid invoice a warning and a paid one a success', () => {
		expect(statusBadgeTone('invoice_status', 'unpaid')).toBe('warning');
		expect(statusBadgeTone('invoice_status', 'paid')).toBe('success');
	});
});
