import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readPrivateDetails } from './private-details';

// These tests are about the requests `readPrivateDetails` builds and how it
// merges the two answers. Which people each view answers for is the database's
// decision, and is tested in `tests/db/private-details.test.ts`.

/** What the stand-in answers for one view. */
type ViewAnswer = { rows?: Record<string, unknown>[]; message?: string };

/**
 * A stand-in Supabase client that answers each view with fixed rows, keeping
 * the ones whose `user_id` is in the batch asked for, and writes down each
 * batch it was asked for.
 */
function createStandInSupabase(answers: Record<string, ViewAnswer>) {
	const batches: { view: string; userIds: string[] }[] = [];

	const supabase = {
		from(view: string) {
			let userIds: string[] = [];
			const builder = {
				select: () => builder,
				in: (_column: string, values: string[]) => {
					userIds = values;
					batches.push({ view, userIds });
					return builder;
				},
				overrideTypes: async () => {
					const answer = answers[view] ?? { rows: [] };

					if (answer.message !== undefined) {
						return { data: null, error: { message: answer.message } };
					}

					const rows = (answer.rows ?? []).filter((row) => userIds.includes(row.user_id as string));
					return { data: rows, error: null };
				}
			};
			return builder;
		}
	};

	return { supabase: supabase as unknown as SupabaseClient, batches };
}

describe('readPrivateDetails', () => {
	it('merges the contact and welfare views into one row a person', async () => {
		const { supabase } = createStandInSupabase({
			staff_contact_details: {
				rows: [{ user_id: 'user-anna', email: 'anna@example.com', phone: '+48 600 100 200' }]
			},
			staff_welfare_details: {
				rows: [
					{
						user_id: 'user-anna',
						date_of_birth: '2008-04-11',
						dietary_requirements: 'Vegetarian',
						emergency_contact_name: 'Ewa Kowalska',
						emergency_contact_phone: '+48 600 100 201'
					},
					{
						user_id: 'user-bruno',
						date_of_birth: '2009-01-02',
						dietary_requirements: null,
						emergency_contact_name: null,
						emergency_contact_phone: null
					}
				]
			}
		});

		const details = await readPrivateDetails(supabase, ['user-anna', 'user-bruno']);

		expect(details.get('user-anna')).toEqual({
			user_id: 'user-anna',
			email: 'anna@example.com',
			phone: '+48 600 100 200',
			date_of_birth: '2008-04-11',
			dietary_requirements: 'Vegetarian',
			emergency_contact_name: 'Ewa Kowalska',
			emergency_contact_phone: '+48 600 100 201'
		});
		// Only the welfare view answered for Bruno, so his contact fields stay empty.
		expect(details.get('user-bruno')?.email).toBeNull();
		expect(details.get('user-bruno')?.date_of_birth).toBe('2009-01-02');
	});

	it('leaves out somebody neither view answers for', async () => {
		const { supabase } = createStandInSupabase({});

		const details = await readPrivateDetails(supabase, ['user-anna']);

		expect(details.has('user-anna')).toBe(false);
	});

	it('asks for a hundred people at a time, each person once, and nothing for nobody', async () => {
		const userIds = Array.from({ length: 150 }, (_, index) => `user-${index}`);
		const { supabase, batches } = createStandInSupabase({});

		await readPrivateDetails(supabase, [...userIds, 'user-0']);

		const contactBatches = batches.filter((batch) => batch.view === 'staff_contact_details');
		expect(contactBatches.map((batch) => batch.userIds.length)).toEqual([100, 50]);

		const { supabase: unused, batches: none } = createStandInSupabase({});
		await readPrivateDetails(unused, []);
		expect(none).toEqual([]);
	});

	it('says what went wrong when a view cannot be read', async () => {
		const { supabase } = createStandInSupabase({ staff_contact_details: { message: 'boom' } });

		await expect(readPrivateDetails(supabase, ['user-anna'])).rejects.toThrow(
			'Could not read the private details: boom'
		);
	});
});
