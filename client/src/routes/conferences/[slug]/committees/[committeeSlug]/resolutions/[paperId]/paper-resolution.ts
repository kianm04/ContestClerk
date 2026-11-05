/*
	The shapes of what `load` gives this page's components: the comment
	threads, and what it reads for a draft resolution or a directive
	(`readResolution` in `+page.server.ts`).
	`Awaited<ReturnType<…>>` would tie them to the server file, so the shape is
	written out here instead.
*/

import type { ResolvedPathname } from '$app/types';
import type { PaperSource, PaperStatus, PaperWords, SourcePaper } from '$lib/committee-papers';
import type { CrisisAnswer, CrisisPanel } from '$lib/crisis-papers';
import type { PaperVote } from '$lib/paper-votes';
import type { PaperThread } from '$lib/paper-comments';
import type { ScreenStep } from '$lib/paper-on-screen';
import type { DaisMember, PaperDecision } from '$lib/paper-submitting';
import type { PaperSupport } from '$lib/paper-support';
import type { ResolutionHeading } from '$lib/resolution-heading';

export type PaperResolution = {
	/** True for a draft resolution, which has a preamble and may be based on working papers. */
	isDraft: boolean;
	/** The committee's words for the people on a paper, which the support's sentence uses. */
	paperWords: PaperWords;
	heading: ResolutionHeading;
	support: PaperSupport;
	/** The working papers it is based on. */
	sources: PaperSource[];
	/** The one of those `?source=` opens beside it, or `null`. */
	openSource: SourcePaper | null;
};

/** The comment threads on the paper, and what the margin needs to show them. */
export type PaperComments = {
	threads: PaperThread[];
	paperUrl: ResolvedPathname;
	timeZone: string;
	editingCommentId: string | null;
};

/** Where the paper stands with the dais, from `load`. */
export type PaperProgress = {
	status: PaperStatus;
	submittedAt: string | null;
	/** What the dais last decided, or `null` while it has decided nothing since the last submission. */
	decision: PaperDecision | null;
	/** The chair a submitted paper's authors wait for, or `null` where several chair it. */
	chair: DaisMember | null;
	/** The crisis staff's answer to a directive or a press release, or `null` while there is none. */
	answer: CrisisAnswer | null;
	/** What the reader sees beside the text of a paper the crisis staff decide, from `crisisPanel`. */
	crisisPanel: CrisisPanel | null;
	/** How the committee's vote on it went, once it passed or failed by a vote; else `null`. */
	vote: PaperVote | null;
	/** Its record copy (`…/print`), once it passed; else `null`. */
	recordHref: ResolvedPathname | null;
};

/** Where the paper stands on the floor (step 6), from `load`. */
export type PaperFloor = {
	/** When the committee introduced it, or `null` before. */
	introducedAt: string | null;
	isOnScreen: boolean;
	/** Whether the reader runs the room and the paper is introduced, so "Show on screen" is theirs. */
	mayShowOnScreen: boolean;
	/** Where the projector stands in the paper while it is on screen with clauses, else `null`. */
	screenStep: ScreenStep | null;
	/** Its threads once introduced, closed to new comments and kept to read; `null` for none. */
	closedThreads: PaperThread[] | null;
};
