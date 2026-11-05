<script lang="ts">
	// `ComponentProps` reads a component's own `Props` type back out of it, so
	// this file does not repeat AgendaMenu's, AttendanceChip's and
	// CommitteeMenu's prop lists by hand and cannot drift out of step with them.
	import type { ComponentProps } from 'svelte';
	import Monitor from '@lucide/svelte/icons/monitor';
	import type { ResolvedPathname } from '$app/types';
	import type { ChairRole } from '$lib/chair-frame';
	import type { LiveStatus } from '$lib/committee-room-live';
	import { QUIET_BUTTON_CLASSES } from '$lib/console-buttons';
	import { LOGO_MARK_IMAGE_PATH } from '$lib/media';
	import { signedInHomeUrl } from '$lib/urls';
	import AgendaMenu from './AgendaMenu.svelte';
	import AttendanceChip from './AttendanceChip.svelte';
	import CommitteeMenu from './CommitteeMenu.svelte';
	import LiveDot from './LiveDot.svelte';
	import SessionTime from './SessionTime.svelte';

	type Props = {
		/** The committee's name and its abbreviation, "UNSC", or null when it has none. */
		committee: { name: string; abbreviation: string | null };
		/** Whether the committee's name is the page's `<h1>`: not on a page with its own header. */
		isNameHeading: boolean;
		agenda: ComponentProps<typeof AgendaMenu>;
		/** The realtime connection, null until the page's script listens. */
		liveStatus: LiveStatus | null;
		/** The session under way and how far the server's clock is ahead; null in the lobby and when ended. */
		session: { name: string; startedAt: string; clockOffsetMs: number } | null;
		/** The attendance chip, null in the lobby and on the ended screen. */
		attendance: ComponentProps<typeof AttendanceChip> | null;
		/** An organiser's line, null for a chair who does not organise. */
		role: ChairRole | null;
		/** The projector's display view, which "Display" opens in a window of its own. */
		displayHref: ResolvedPathname;
		menu: ComponentProps<typeof CommitteeMenu>;
	};

	let {
		committee,
		isNameHeading,
		agenda,
		liveStatus,
		session,
		attendance,
		role,
		displayHref,
		menu
	}: Props = $props();

	const shortName = $derived(committee.abbreviation ?? committee.name);
	// A screen reader hears the full name after the abbreviation; a name alone is said once.
	const spokenRest = $derived(committee.abbreviation === null ? '' : `, ${committee.name}`);
	const spokenName = $derived(`${shortName}${spokenRest}`);
</script>

<!--
	The console's top bar, 56 px and one row at every width: the mark, the
	committee, the agenda, then on the right the connection, the session's
	time, the attendance chip, an organiser's dashboard link, Display and the
	committee menu. A phone keeps the mark, the committee, the agenda, the dot,
	the chip and the menu; `max-md:hidden` leaves the rest out there.
-->
<header
	class="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface pr-4 pl-5 whitespace-nowrap max-md:gap-2.5 max-md:pr-2 max-md:pl-3 print:hidden"
>
	<!-- The mark alone leads to `/home`, where the notifications and the account menu are. -->
	<a href={signedInHomeUrl()} aria-label="MUNMeet home" class="flex h-8 shrink-0 items-center">
		<img src={LOGO_MARK_IMAGE_PATH} alt="" class="h-7 w-auto" />
	</a>
	<span class="h-6 w-px shrink-0 bg-line max-md:hidden" aria-hidden="true"></span>

	<!--
		The full name is the heading's `title` and, for a screen reader, part of
		its name: "UNSC, Security Council". The heading takes it as `aria-label`,
		because a browser reads a visually hidden part as a separate box and puts
		a space before its comma. A paragraph may not carry `aria-label`, so on a
		page with its own heading the hidden part stays in the text.
	-->
	{#if isNameHeading}
		<h1 title={committee.name} aria-label={spokenName} class="shrink-0 text-body font-semibold">
			{shortName}
		</h1>
	{:else}
		<p title={committee.name} class="shrink-0 text-body font-semibold">
			{shortName}<span class="sr-only">{spokenRest}</span>
		</p>
	{/if}

	<AgendaMenu {...agenda} />

	<div class="ml-auto flex shrink-0 items-center gap-4 max-md:gap-2">
		{#if session}
			<LiveDot status={liveStatus} />
			<div class="max-md:hidden">
				<SessionTime
					sessionName={session.name}
					startedAt={session.startedAt}
					clockOffsetMs={session.clockOffsetMs}
				/>
			</div>
		{/if}
		{#if attendance}
			<AttendanceChip {...attendance} />
		{/if}
		{#if role}
			<p class="text-small text-ink-600">
				<span class="max-md:hidden">{role.label} ·</span>
				<a href={role.dashboardHref} class="text-brand-700 underline">Dashboard</a>
			</p>
		{/if}
		<!--
			A new window, for the projector; a plain link, so it opens without
			JavaScript. `rel="noopener"` keeps the new window from reaching back
			into this one through `window.opener`.
		-->
		<a
			href={displayHref}
			target="_blank"
			rel="noopener"
			class="{QUIET_BUTTON_CLASSES} gap-2 px-3 max-md:hidden"
		>
			<Monitor size={20} strokeWidth={1.75} aria-hidden="true" />
			Display
		</a>
		<CommitteeMenu {...menu} />
	</div>
</header>
