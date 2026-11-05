/**
 * The row of chips under the directory's search box: "All", the levels and the
 * regions, after the product owner's mockup (Trello WMcXfry0).
 *
 * Each chip is a plain link to the directory with one filter turned on, or off
 * again when it is already on, so the row works without JavaScript and every
 * chip's result can be shared as an address. The chips the mockup has room for
 * are in the row; the rest wait behind "More".
 */

import type { ResolvedPathname } from '$app/types';
import { CONFERENCE_LEVELS, type ConferenceLevel, type ConferenceQuery } from '$lib/conferences';
import { REGION_OPTIONS, type ConferenceRegion } from '$lib/regions';
import { statusLabel } from '$lib/status';
import { conferenceListUrl } from '$lib/urls';

/** One chip: what it says, where it goes, and whether the results are filtered its way. */
export type QuickFilterChip = {
	/** `all`, a level such as `university`, or a region such as `europe`. Unique in the row. */
	key: string;
	label: string;
	href: ResolvedPathname;
	/** Whether the results on screen are filtered the way this chip filters them. */
	isActive: boolean;
};

/** The levels and regions with a chip in the row itself. The rest go behind "More". */
const CHIPS_IN_ROW = ['high_school', 'university', 'europe', 'asia', 'north_america'];

/** The address for these filters, back on the first page, since the results change. */
function firstPageUrl(query: ConferenceQuery): ResolvedPathname {
	return conferenceListUrl({ ...query, page: 1 });
}

/** "All": no level and no region, whatever else is set. */
function allChip(query: ConferenceQuery): QuickFilterChip {
	const isActive = query.level === '' && query.regions.length === 0;
	const href = firstPageUrl({ ...query, level: '', regions: [] });

	return { key: 'all', label: 'All', href, isActive };
}

/** A level's chip chooses that level, or goes back to every level when it is already chosen. */
function levelChip(query: ConferenceQuery, level: ConferenceLevel): QuickFilterChip {
	const isActive = query.level === level;
	const href = firstPageUrl({ ...query, level: isActive ? '' : level });

	return { key: level, label: statusLabel('conference_level', level), href, isActive };
}

/** A region's chip adds that region to the ones chosen, or takes it away again. */
function regionChip(
	query: ConferenceQuery,
	region: ConferenceRegion,
	label: string
): QuickFilterChip {
	const isActive = query.regions.includes(region);
	const regions = isActive
		? query.regions.filter((chosenRegion) => chosenRegion !== region)
		: [...query.regions, region];

	return { key: region, label, href: firstPageUrl({ ...query, regions }), isActive };
}

/**
 * Every chip for the results on screen: the ones drawn in the row, "All" first,
 * and the ones behind "More". Levels come before regions in both.
 */
export function quickFilterChips(query: ConferenceQuery): {
	inRow: QuickFilterChip[];
	inMore: QuickFilterChip[];
} {
	const levelChips = CONFERENCE_LEVELS.map((level) => levelChip(query, level));
	const regionChips = REGION_OPTIONS.map((option) => regionChip(query, option.value, option.label));
	const levelAndRegionChips = [...levelChips, ...regionChips];

	const inRow = levelAndRegionChips.filter((chip) => CHIPS_IN_ROW.includes(chip.key));
	const inMore = levelAndRegionChips.filter((chip) => !CHIPS_IN_ROW.includes(chip.key));

	return { inRow: [allChip(query), ...inRow], inMore };
}
