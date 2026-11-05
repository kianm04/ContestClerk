<script lang="ts">
	import type { ChairForm } from '$lib/chair-form';
	import {
		chairRole,
		committeeMenuLinks,
		isCommitteeNameHeading,
		isSessionInProgress,
		type CommitteeTools,
		type ConsoleFrame,
		type SessionControls
	} from '$lib/chair-frame';
	import type { CommitteeSession } from '$lib/chair-room';
	import type { LiveStatus } from '$lib/committee-room-live';
	import type { ShortcutsSetting } from '$lib/console-shortcuts.svelte';
	import type { ChairPage } from '$lib/live-mode';
	import { modeEndActions } from '$lib/mode-strip';
	import { signedInHomeUrl } from '$lib/urls';
	import ConsoleTopBar from './ConsoleTopBar.svelte';
	import LiveStrip from './LiveStrip.svelte';

	/** What the chair layout's `data` holds that the top of the console reads. */
	type ConsoleTopData = {
		conference: { slug: string };
		committee: { slug: string; name: string; abbreviation: string | null; topics: string[] };
		sessions: CommitteeSession[];
		isOrganiser: boolean;
		isNamedChair: boolean;
		/** Which of Papers, Notes and Awards the committee menu offers (`CommitteeTools`). */
		committeeTools: CommitteeTools;
		/** `?agenda=change`, which draws the agenda menu open without JavaScript. */
		isAgendaMenuOpen: boolean;
		/**
		 * A quick session's: no role line, "Edit delegations" in place of Awards in
		 * the committee menu, and "Add a topic" in the agenda menu.
		 */
		isQuickSession: boolean;
		/** The session's General Speakers' List, which the strip's "End caucus" puts back at the press. */
		generalSpeakersListId: string | null;
	};

	type Props = {
		data: ConsoleTopData;
		/** Everything the frame draws, with the presses on their way laid on top (`consoleFrame`). */
		shown: ConsoleFrame;
		/** The chair page the console is drawn around. */
		chairPage: ChairPage;
		liveStatus: LiveStatus | null;
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
		/** The chair's instant form (`$lib/chair-form.ts`). */
		submitExpecting: ChairForm['submitExpecting'];
		shortcuts: ShortcutsSetting;
		sessionControls: SessionControls;
	};

	let {
		data,
		shown,
		chairPage,
		liveStatus,
		clockOffsetMs,
		submitExpecting,
		shortcuts,
		sessionControls
	}: Props = $props();

	// The session, its time and the attendance chip show only while a session is under way.
	const session = $derived(shown.frame.currentSession);
	const isInSession = $derived(isSessionInProgress(shown.roomState));
	const sessionShown = $derived(
		isInSession && session?.startedAt
			? { name: session.name, startedAt: session.startedAt, clockOffsetMs }
			: null
	);
	const attendance = $derived({
		presence: shown.presence,
		isOpening: shown.roomState === 'opening',
		rollCallHref: shown.links.rollCallHref
	});
</script>

<!--
	The top of the chair console: the top bar, then the live strip while the
	chair looks at another view than the live one (`committee-room.md`, "Top
	bar" and "Live strip"). "Display" opens the projector's view.
-->
<ConsoleTopBar
	committee={data.committee}
	isNameHeading={isCommitteeNameHeading(chairPage, shown.roomState)}
	agenda={{
		topics: data.committee.topics,
		agendaTopic: shown.frame.committeeState.agendaTopic,
		setAgendaAction: shown.links.setAgendaAction,
		addTopicAction: data.isQuickSession ? shown.links.addTopicAction : null,
		isOpen: data.isAgendaMenuOpen,
		submitExpecting
	}}
	{liveStatus}
	session={sessionShown}
	attendance={isInSession ? attendance : null}
	role={chairRole(data.isOrganiser, data.isNamedChair, data.conference.slug, data.isQuickSession)}
	displayHref={shown.links.displayHref}
	menu={{
		links: committeeMenuLinks(
			data.conference.slug,
			data.committee.slug,
			data.sessions,
			data.committeeTools,
			data.isQuickSession
		),
		leaveHref: signedInHomeUrl(),
		areShortcutsOn: shortcuts.isOn,
		onToggleShortcuts: shortcuts.toggle,
		keyListRequestCount: shortcuts.keyListRequestCount,
		sessionControls: shown.isModeBarShown ? sessionControls : null
	}}
/>
{#if shown.liveStrip}
	<LiveStrip
		live={shown.liveStrip}
		floor={shown.floor}
		committeeState={shown.frame.committeeState}
		generalListId={data.generalSpeakersListId}
		roomHref={shown.links.roomHref}
		links={shown.links}
		{clockOffsetMs}
		{submitExpecting}
		endActions={modeEndActions(data.conference.slug, data.committee.slug, chairPage)}
		caucusClock={shown.frame.committeeState.caucusClock}
	/>
{/if}
