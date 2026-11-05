import { describe, expect, it } from 'vitest';
import type { ManagedFee } from './fees';
import { feeStatus, feeValidityLabel } from './fee-list';

/** A fee for one delegate with no window, which the tests change one field at a time. */
function fee(changes: Partial<ManagedFee> = {}): ManagedFee {
	return {
		id: 'fee-1',
		name: 'Delegate fee',
		amountCents: 4500,
		appliesTo: 'individual',
		validFrom: null,
		validUntil: null,
		position: 0,
		invoiceCount: 0,
		...changes
	};
}

const NOW = new Date('2026-10-02T12:00:00Z');

describe('feeValidityLabel', () => {
	it('says "Always" for a fee with no window', () => {
		expect(feeValidityLabel(fee(), 'Europe/London')).toBe('Always');
	});

	it('says when the window ends', () => {
		const earlyBird = fee({ validUntil: '2026-12-31T12:00:00Z' });

		expect(feeValidityLabel(earlyBird, 'Europe/London')).toBe('Until 31 Dec 2026');
	});
});

describe('feeStatus', () => {
	it('marks the fee an acceptance would invoice now', () => {
		const delegateFee = fee();

		expect(feeStatus(delegateFee, [delegateFee], NOW)).toEqual({
			tone: 'success',
			label: 'Charged now'
		});
	});

	it('marks one fee per kind of delegate, not two of the same kind', () => {
		const first = fee({ id: 'fee-1' });
		const second = fee({ id: 'fee-2', position: 1 });
		const delegationFee = fee({ id: 'fee-3', appliesTo: 'delegation_member', position: 2 });
		const fees = [first, second, delegationFee];

		expect(feeStatus(first, fees, NOW)?.label).toBe('Charged now');
		expect(feeStatus(second, fees, NOW)).toBeNull();
		expect(feeStatus(delegationFee, fees, NOW)?.label).toBe('Charged now');
	});

	it('warns about a fee whose window has closed', () => {
		const closed = fee({ validUntil: '2020-01-01T00:00:00Z' });

		expect(feeStatus(closed, [closed], NOW)).toEqual({
			tone: 'warning',
			label: 'Not currently valid'
		});
	});
});
