<!-- A `module` script runs once for the file, so what it exports can be imported elsewhere. -->
<script lang="ts" module>
	import type { LucideIcon } from '@lucide/svelte';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Info from '@lucide/svelte/icons/info';

	/** How far one part of a conference is, as the Setup and Launch steps say it. */
	export type CreationStatus =
		| 'ready'
		| 'mostly_ready'
		| 'configured'
		| 'not_decided'
		| 'not_imported'
		| 'optional'
		| 'review'
		| 'needs_dates'
		| 'blocked';

	/** The word, the icon and the colours of one status. */
	export type StatusTone = {
		label: string;
		icon: LucideIcon;
		/** The pill's fill and text, in the design's green, amber or red. */
		chipClass: string;
		/** The colour of the icon and word when they are drawn without a pill, as Launch does. */
		textClass: string;
	};

	/*
		Green for done, amber for "look at this" and for a part still open, and red
		only for what stops the conference going public. The Setup design draws
		"Not decided" and "Not yet imported" in the same amber pill as "Mostly
		ready"; the Launch step, which writes the word without a pill, keeps them
		in the quieter blue (`textClass`). The words always say it too, because
		colour is never the only signal.
	*/
	const SUCCESS = {
		chipClass: 'bg-creation-green-pill text-creation-green-pill-text',
		textClass: 'text-success'
	};
	const WARNING = {
		chipClass: 'bg-creation-amber-tint text-creation-amber',
		textClass: 'text-warning'
	};
	const NEUTRAL = {
		chipClass: 'bg-creation-amber-tint text-creation-amber',
		textClass: 'text-link'
	};
	const DANGER = {
		chipClass: 'bg-creation-red-tint text-creation-red',
		textClass: 'text-destructive'
	};

	const TONES: Record<CreationStatus, StatusTone> = {
		ready: { label: 'Ready', icon: CircleCheck, ...SUCCESS },
		configured: { label: 'Configured', icon: CircleCheck, ...SUCCESS },
		mostly_ready: { label: 'Mostly ready', icon: CircleAlert, ...WARNING },
		review: { label: 'Review', icon: CircleAlert, ...WARNING },
		not_decided: { label: 'Not decided', icon: Info, ...NEUTRAL },
		// Last year's committees are there to copy and none have been yet.
		not_imported: { label: 'Not yet imported', icon: Info, ...NEUTRAL },
		optional: { label: 'Optional', icon: Info, ...NEUTRAL },
		needs_dates: { label: 'Dates needed', icon: CircleAlert, ...DANGER },
		// The Launch step's word for a row that stops the conference going public.
		blocked: { label: 'Needed', icon: CircleAlert, ...DANGER }
	};

	/** How a status is drawn, for a row that shows the icon and word without the pill. */
	export function tone(status: CreationStatus): StatusTone {
		return TONES[status];
	}
</script>

<script lang="ts">
	import { creationClasses } from '$lib/creation-classes';

	type Props = {
		status: CreationStatus;
		/** Other words for the pill than the status's own, when a screen needs them. */
		label?: string;
		/** The pill's size where it is not the panel's 28 pixels, such as `h-6.5 px-2.75 fs-12`. */
		class?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { status, label, class: className }: Props = $props();

	// `$derived` works this out again whenever `status` changes.
	const chip = $derived(tone(status));
</script>

<!--
	The rounded pill the Setup design puts beside a panel's title: its state's
	tint, the word in a darker shade of it, no border and no icon. 28 design
	pixels tall unless the caller's `class` says otherwise; `creationClasses`
	lets that class replace the size here rather than fight it.
-->
<span
	class={creationClasses(
		'inline-flex h-7 shrink-0 items-center rounded-full px-4 fs-13 font-medium whitespace-nowrap',
		chip.chipClass,
		className
	)}
>
	{label ?? chip.label}
</span>
