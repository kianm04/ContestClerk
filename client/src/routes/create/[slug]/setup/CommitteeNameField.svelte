<script lang="ts">
	import * as Command from '$lib/components/ui/command';
	import { Input } from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';
	import {
		catalogueLabel,
		searchCatalogue,
		type CatalogueCommittee
	} from '$lib/committee-catalogue';
	import { fieldErrorId } from '$lib/form-fields';
	import { DIALOG_INPUT_CLASSES } from './dialog-field-classes';
	import SetupField from './SetupField.svelte';

	type Props = {
		name: string;
		error?: string;
		/** The input's distance under the label: 6 when creating, 3 when editing. */
		controlClass?: string;
		/** Called with the catalogue committee the organiser picks. */
		onpick: (committee: CatalogueCommittee) => void;
	};

	// `$bindable()` lets the dialog write `bind:name={...}` and see every keystroke.
	let { name = $bindable(), error, controlClass, onpick }: Props = $props();

	const LIST_ID = 'committee-name-suggestions';
	/** The design's list shows four suggestions. */
	const SUGGESTION_COUNT = 4;

	/** The text field, which the list floats under; `bind:ref` fills it in. */
	let input = $state<HTMLInputElement | null>(null);
	let isListOpen = $state(false);
	let activeIndex = $state(0);
	// `$derived` searches again whenever `name` changes; under two letters finds nothing.
	const suggestions = $derived(searchCatalogue(name, SUGGESTION_COUNT));
	const isShown = $derived(isListOpen && suggestions.length > 0);
	// The suggestion the arrow keys are on, by the words `Command` knows it by.
	const activeLabel = $derived(
		suggestions[activeIndex] ? catalogueLabel(suggestions[activeIndex]) : ''
	);

	function pick(committee: CatalogueCommittee) {
		onpick(committee);
		isListOpen = false;
	}

	/** Arrow keys move through the list, Enter picks, Escape closes only the list. */
	function handleKeydown(event: KeyboardEvent) {
		if (!isShown) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			activeIndex = (activeIndex + step + suggestions.length) % suggestions.length;
		} else if (event.key === 'Enter') {
			// Enter in a field would otherwise send the whole form.
			event.preventDefault();
			pick(suggestions[activeIndex]);
		} else if (event.key === 'Escape') {
			// Stopping it here keeps the dialog itself open.
			event.stopPropagation();
			isListOpen = false;
		}
	}
</script>

<SetupField id="name" label="Committee name" isRequired {error} {controlClass}>
	<!--
		A combobox: the name is a real text field, sent with the form and typed
		freely, and shadcn's `Command` list of catalogue committees floats in a
		`Popover` under it, 4 pixels down and wider than the field, as the design
		draws it. The typing stays in the field, so the arrow keys are handled
		here and `Command` is told which suggestion they are on; the `aria-*`
		attributes tell a screen reader the same. The `Popover` is not opened by
		a button of its own: `open` follows the typing, `customAnchor` puts it
		under the field, and the `...AutoFocus` handlers leave the focus in it.
		It is drawn inside the dialog rather than at the end of the page, so it
		belongs to the dialog; `role="presentation"` keeps it from being read as
		a dialog of its own, since the list inside is what a reader uses.
	-->
	<Popover.Root bind:open={() => isShown, (isOpen) => (isListOpen = isOpen)}>
		<Input
			bind:ref={input}
			id="name"
			name="name"
			role="combobox"
			autocomplete="off"
			maxlength={120}
			aria-required="true"
			class={DIALOG_INPUT_CLASSES}
			aria-expanded={isShown}
			aria-controls={LIST_ID}
			aria-activedescendant={isShown ? `${LIST_ID}-${activeIndex}` : undefined}
			aria-describedby={error ? fieldErrorId('name') : undefined}
			bind:value={name}
			oninput={() => ((isListOpen = true), (activeIndex = 0))}
			onkeydown={handleKeydown}
			onblur={() => (isListOpen = false)}
		/>
		<Popover.Content
			customAnchor={input}
			portalProps={{ disabled: true }}
			role="presentation"
			side="bottom"
			align="start"
			sideOffset={4}
			trapFocus={false}
			onOpenAutoFocus={(event) => event.preventDefault()}
			onCloseAutoFocus={(event) => event.preventDefault()}
			onInteractOutside={(event) => event.target === input && event.preventDefault()}
			onmousedown={(event: MouseEvent) => event.preventDefault()}
			class="creation-root creation-root-dialog w-101 gap-0 rounded-lg border border-creation-panel-border bg-white p-0 shadow-creation-menu ring-0 max-lg:w-(--bits-popover-anchor-width)"
		>
			<!-- `onmousedown` above keeps the focus in the field while a suggestion is clicked. -->
			<Command.Root shouldFilter={false} value={activeLabel} class="rounded-lg! bg-white p-1">
				<Command.List id={LIST_ID} class="max-h-none">
					{#each suggestions as committee, index (committee.abbreviation)}
						<Command.Item
							id="{LIST_ID}-{index}"
							value={catalogueLabel(committee)}
							onSelect={() => pick(committee)}
							class="block h-7.5 cursor-pointer truncate rounded-sm px-3 py-0 fs-14 lh-30 text-creation-ink-950 data-selected:bg-creation-hover data-selected:text-creation-ink-950 max-lg:h-11 max-lg:lh-44 [&>svg]:hidden"
						>
							{catalogueLabel(committee)}
						</Command.Item>
					{/each}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
</SetupField>
