<script lang="ts">
	import { onMount } from 'svelte';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import { readTypedCount, steppedCount } from '$lib/count-stepper';

	type Props = {
		/** The field's name in the form: `votesFor`, `votesAgainst`, `votesAbstain`. */
		name: string;
		/** The words above it, which also name it: "For", "Against", "Abstain". */
		label: string;
		/** The count, or null while it is not counted (an empty field). */
		value: number | null;
		/** `md` under a motion, `lg` for a show of hands, where the tally is the largest thing. */
		size?: 'md' | 'lg';
		/** Called with the new count after a − or + press or a typed change; null for an empty field. */
		onChange: (value: number | null) => void;
	};

	let { name, label, value, size = 'md', onChange }: Props = $props();

	const fieldId = $derived(`${name}-count`);
	const lowerLabel = $derived(label.toLowerCase());
	const isLarge = $derived(size === 'lg');

	/*
		What the field shows. A `$derived` can be assigned to: what the chair
		types stays as typed ("04" is not rewritten to "4" mid-word) until the
		count from outside changes, and then the field shows that count.
	*/
	let text = $derived(value === null ? '' : String(value));

	/*
		Whether this component is running in the browser. Without JavaScript the
		− and + cannot work, so they are kept invisible (their space stays, so
		nothing jumps when the script starts) and the chair types the count.
		`onMount` only ever runs in the browser, once Svelte has taken over.
	*/
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
	});

	function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
		text = event.currentTarget.value;
		onChange(readTypedCount(text));
	}

	function handleStep(step: 1 | -1) {
		onChange(steppedCount(value, step));
	}

	// The two sizes of the study (`views.css`, "stepper" and "stepper-lg"), written out for Tailwind.
	const buttonSize = $derived(isLarge ? 'h-16 w-14' : 'size-11');
	const fieldSize = $derived(isLarge ? 'h-16 w-[88px] text-h1' : 'h-11 w-14 text-[20px]');
	const iconSize = $derived(isLarge ? 22 : 18);
	const BUTTON_CLASSES =
		'flex items-center justify-center text-ink-600 hover:bg-neutral-100 hover:text-ink-900';
</script>

<!--
	A count between a − and a + (`CountStepper`, components.md). The field is
	the real form control, so a count is typed and sent without JavaScript;
	`inputmode="numeric"` brings up the number keys on a phone. The − and +
	are plain buttons (`type="button"`), so they never send the form.
-->
<div class="flex flex-col gap-1.5">
	<label for={fieldId} class="text-small text-ink-600">{label}</label>
	<div class="inline-flex w-fit items-center rounded-control border border-line">
		<button
			type="button"
			aria-label="One fewer {lowerLabel}"
			onclick={() => handleStep(-1)}
			class="{BUTTON_CLASSES} {buttonSize} rounded-l-[9px] {isScriptRunning ? '' : 'invisible'}"
		>
			<Minus size={iconSize} strokeWidth={1.75} aria-hidden="true" />
		</button>
		<input
			id={fieldId}
			{name}
			type="text"
			inputmode="numeric"
			autocomplete="off"
			placeholder="–"
			value={text}
			oninput={handleInput}
			class="border-x border-line bg-transparent text-center font-semibold tabular-nums placeholder:font-normal placeholder:text-ink-400 focus:outline-2 focus:-outline-offset-1 focus:outline-brand-500 {fieldSize}"
		/>
		<button
			type="button"
			aria-label="One more {lowerLabel}"
			onclick={() => handleStep(1)}
			class="{BUTTON_CLASSES} {buttonSize} rounded-r-[9px] {isScriptRunning ? '' : 'invisible'}"
		>
			<Plus size={iconSize} strokeWidth={1.75} aria-hidden="true" />
		</button>
	</div>
</div>
