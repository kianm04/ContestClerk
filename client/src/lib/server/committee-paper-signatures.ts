/**
 * Signatures on a draft resolution or a committee directive
 * (`docs/committee-papers.md`, section 3, rules 3 and 6, and section 5): an
 * author opens the paper for signatures, which shows it to the committee and
 * the dais; a delegate of the committee signs it or takes their signature
 * off; and the page reads the support the paper has against the support the
 * committee asks for.
 *
 * Each change goes through the database's own function, which checks who may
 * make it. A refused one answers with the function's own sentence, such as
 * "An author does not sign their own paper.", which the page shows as it is.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaperPerson } from '$lib/committee-papers';
import {
	paperSupport,
	type PaperSupport,
	type SupportRules,
	type SupportUnit
} from '$lib/paper-support';

/** The codes the paper functions refuse with, as in `./committee-paper-authors.ts`. */
const REFUSAL_CODES = new Set(['42501', '22023', 'P0002']);

/** What a change came to: `refusal` is `null` once it is done, or the sentence that says why not. */
export type SignatureChange = { refusal: string | null };

/** The change, or the sentence it was refused with. Throws on a fault. */
function toChange(
	error: { code: string; message: string } | null,
	failure: string
): SignatureChange {
	if (error === null) return { refusal: null };

	if (REFUSAL_CODES.has(error.code)) return { refusal: error.message };

	throw new Error(`${failure}: ${error.message}`);
}

/**
 * "Open for signatures", or "Close signatures" with `isOpen` false. Closing
 * keeps the signatures the paper has; it only stops new ones.
 */
export async function setSignaturesOpen(
	supabase: SupabaseClient,
	paperId: string,
	isOpen: boolean
): Promise<SignatureChange> {
	const { error } = await supabase.rpc('set_paper_signatures_open', {
		paper_id: paperId,
		is_open: isOpen
	});

	return toChange(error, 'Could not change whether the paper takes signatures');
}

/** "Sign as Ghana": the reader's seat signs the paper. Signing twice changes nothing. */
export async function signPaper(
	supabase: SupabaseClient,
	paperId: string
): Promise<SignatureChange> {
	const { error } = await supabase.rpc('sign_paper', { paper_id: paperId });

	return toChange(error, 'Could not sign the paper');
}

/** "Remove my signature", until the paper is submitted. */
export async function removeSignature(
	supabase: SupabaseClient,
	paperId: string
): Promise<SignatureChange> {
	const { error } = await supabase.rpc('remove_signature', { paper_id: paperId });

	return toChange(error, 'Could not take the signature off');
}

/** The committee's support settings, as `committees` stores them. */
type SupportRulesRow = {
	support_minimum: number;
	support_unit: SupportUnit;
	support_counts_sponsors: boolean;
	sponsor_limit: number | null;
	checks_format: boolean;
};

/**
 * The support a paper with these people has, against what the committee
 * asks for now: settings are read when they matter, never written into
 * papers (section 5). The number needed comes from `paper_support_needed`,
 * the same function `submit_paper` checks with.
 */
export async function readPaperSupport(
	supabase: SupabaseClient,
	committeeId: string,
	people: readonly PaperPerson[]
): Promise<PaperSupport> {
	const settings = await supabase
		.from('committees')
		.select('support_minimum, support_unit, support_counts_sponsors, sponsor_limit, checks_format')
		.eq('id', committeeId)
		.single()
		.overrideTypes<SupportRulesRow, { merge: false }>();

	if (settings.error || !settings.data) {
		throw new Error(`Could not read the committee's support settings: ${settings.error?.message}`);
	}

	const rules: SupportRules = {
		minimum: settings.data.support_minimum,
		unit: settings.data.support_unit,
		countsSponsors: settings.data.support_counts_sponsors,
		sponsorLimit: settings.data.sponsor_limit,
		checksFormat: settings.data.checks_format
	};

	const [needed, seats] = await Promise.all([
		supabase.rpc('paper_support_needed', {
			committee_id: committeeId,
			minimum: rules.minimum,
			unit: rules.unit
		}),
		supabase
			.from('seats')
			// `head: true` asks for the count alone, without the rows.
			.select('id', { count: 'exact', head: true })
			.eq('committee_id', committeeId)
			.not('user_id', 'is', null)
	]);

	if (needed.error) {
		throw new Error(`Could not work out the support needed: ${needed.error.message}`);
	}

	if (seats.error) {
		throw new Error(`Could not count the committee's delegates: ${seats.error.message}`);
	}

	return paperSupport(people, rules, Number(needed.data), seats.count ?? 0);
}
