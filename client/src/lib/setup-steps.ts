/**
 * The six steps of setting a draft conference up (the manage redesign,
 * `specs/03-design/manage-redesign/`).
 *
 * While a conference is a draft, the management sidebar numbers its "Set up"
 * pages 1 to 6, ticks the ones that are done, and locks "Publish" until the
 * three required steps are. Each setup page says which step it is above its
 * title ("Step 4 of 6 · optional") and in its sticky footer ("Step 4 of 6 ·
 * next: team"). Everything here is worked out from which steps are done, which
 * the server reads (`$lib/server/manage-layout.ts`).
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { ResolvedPathname } from '$app/types';
import type { PublishChecklistLine, PublishChecklistLineKey } from '$lib/publish-checklist';
import {
	manageApplicationFormUrl,
	manageCommitteesUrl,
	manageDetailsUrl,
	manageFeesUrl,
	managePublishUrl,
	manageTeamUrl
} from '$lib/urls';

/** Which step this is. */
export type SetupStepKey =
	'details' | 'committees' | 'application-form' | 'fees' | 'team' | 'publish';

/**
 * Which of the five steps before Publish are done, worked out on the server.
 * Publish itself is never "done": once it is, the conference is no longer a draft.
 */
export type SetupProgress = {
	details: boolean;
	committees: boolean;
	applicationForm: boolean;
	fees: boolean;
	team: boolean;
};

/** One step of setting up, as the sidebar and the setup pages draw it. */
export type SetupStep = {
	key: SetupStepKey;
	/** 1 to 6, the number in the sidebar's round marker. */
	number: number;
	label: string;
	href: ResolvedPathname;
	/** Fees and Team can be left out; the sidebar says "Optional" beside them. */
	isOptional: boolean;
	isDone: boolean;
	/** Only Publish locks, until every required step before it is done. */
	isLocked: boolean;
};

/** How many steps there are, the "of 6" in "Step 4 of 6". */
export const SETUP_STEP_COUNT = 6;

/** Whether the three required steps (Details, Committees, Application form) are done. */
export function areRequiredStepsDone(progress: SetupProgress): boolean {
	return progress.details && progress.committees && progress.applicationForm;
}

/** The six steps of one conference, in order. */
export function setupSteps(slug: string, progress: SetupProgress): SetupStep[] {
	const canPublish = areRequiredStepsDone(progress);

	return [
		step('details', 1, 'Details', manageDetailsUrl(slug), false, progress.details),
		step('committees', 2, 'Committees', manageCommitteesUrl(slug), false, progress.committees),
		step(
			'application-form',
			3,
			'Application form',
			manageApplicationFormUrl(slug),
			false,
			progress.applicationForm
		),
		step('fees', 4, 'Fees', manageFeesUrl(slug), true, progress.fees),
		step('team', 5, 'Team', manageTeamUrl(slug), true, progress.team),
		{
			...step('publish', 6, 'Publish', managePublishUrl(slug), false, false),
			isLocked: !canPublish
		}
	];
}

/** One step that does not lock. `setupSteps` locks Publish itself. */
function step(
	key: SetupStepKey,
	number: number,
	label: string,
	href: ResolvedPathname,
	isOptional: boolean,
	isDone: boolean
): SetupStep {
	return { key, number, label, href, isOptional, isDone, isLocked: false };
}

/** The step with this key. Every key is in the list, so this always finds one. */
export function findSetupStep(steps: SetupStep[], key: SetupStepKey): SetupStep {
	const found = steps.find((candidate) => candidate.key === key);

	if (found === undefined) {
		throw new Error(`There is no setup step called ${key}.`);
	}

	return found;
}

/**
 * Where a draft's `/manage/[slug]` sends the organiser, because a draft has no
 * dashboard yet: the first required step that is not done, or Publish once all
 * three are. The optional steps are skipped, as their "Skip for now" button is.
 */
export function stepToContinue(steps: SetupStep[]): SetupStep {
	const firstUndone = steps.find((candidate) => !candidate.isOptional && !candidate.isDone);

	return firstUndone ?? findSetupStep(steps, 'publish');
}

/** The step after this one, or `null` after Publish. */
export function nextSetupStepAfter(steps: SetupStep[], current: SetupStep): SetupStep | null {
	return steps[current.number] ?? null;
}

/** Nothing done yet, for `stepUrlAfter`, which needs the order and not the ticks. */
const NO_PROGRESS: SetupProgress = {
	details: false,
	committees: false,
	applicationForm: false,
	fees: false,
	team: false
};

/**
 * Where "Save and continue" on a setup step goes once its form is saved: the
 * next step's page, done or not, or `null` on Publish, which has no next step.
 * A form action can call this without knowing which steps are done.
 */
export function stepUrlAfter(slug: string, key: SetupStepKey): ResolvedPathname | null {
	const steps = setupSteps(slug, NO_PROGRESS);
	const next = nextSetupStepAfter(steps, findSetupStep(steps, key));

	return next?.href ?? null;
}

/** The step before this one, or `null` before Details. */
export function previousSetupStep(steps: SetupStep[], current: SetupStep): SetupStep | null {
	return steps[current.number - 2] ?? null;
}

/** The small line above a setup page's title: "Step 4 of 6 · optional". */
export function setupStepEyebrow(current: SetupStep): string {
	const position = `Step ${current.number} of ${SETUP_STEP_COUNT}`;

	if (current.isOptional) {
		return `${position} · optional`;
	}

	return position;
}

/** The words at the left of the sticky footer: "Step 4 of 6 · next: team". */
export function setupStepFooterText(steps: SetupStep[], current: SetupStep): string {
	const position = `Step ${current.number} of ${SETUP_STEP_COUNT}`;
	const next = nextSetupStepAfter(steps, current);

	if (next === null) {
		return position;
	}

	return `${position} · next: ${next.label.toLowerCase()}`;
}

/**
 * Which steps are done, read off the publish checklist (`$lib/publish-checklist.ts`)
 * so that the sidebar's ticks and the Publish page never disagree. Team is the
 * one step the checklist does not cover: it is done once somebody has been
 * invited to help, or is already on the conference's team.
 */
export function setupProgressFromChecklist(
	lines: PublishChecklistLine[],
	hasTeam: boolean
): SetupProgress {
	return {
		details: isLineDone(lines, 'details'),
		committees: isLineDone(lines, 'committees'),
		applicationForm: isLineDone(lines, 'application-window'),
		fees: isLineDone(lines, 'fees'),
		team: hasTeam
	};
}

/** Whether the checklist line with this key is ticked. A missing line is not. */
function isLineDone(lines: PublishChecklistLine[], key: PublishChecklistLineKey): boolean {
	const line = lines.find((candidate) => candidate.key === key);

	return line?.isDone ?? false;
}
