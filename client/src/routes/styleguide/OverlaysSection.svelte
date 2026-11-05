<script lang="ts">
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Dropdown, { type DropdownItem } from '$lib/components/Dropdown.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { SAMPLE_MESSAGES } from '$lib/styleguide-samples';
	import { styleguideUrl } from '$lib/urls';
	import Example from './Example.svelte';
	import Group from './Group.svelte';

	// `$state` makes Svelte redraw whatever reads this when it changes, which is
	// how pressing the button below opens the dialog.
	let isModalOpen = $state(false);

	function handleOpenModal() {
		isModalOpen = true;
	}

	function handleCloseModal() {
		isModalOpen = false;
	}

	// A menu of links, and a menu whose last line posts. Both point back at this
	// page, because the styleguide has nowhere else to send anybody.
	const linkItems: DropdownItem[] = [
		{ label: 'View application', href: styleguideUrl() },
		{ label: 'Message applicant', href: styleguideUrl() }
	];

	const postItems: DropdownItem[] = [
		{ label: 'View application', href: styleguideUrl() },
		{ label: 'Reject', formaction: styleguideUrl(), tone: 'danger' }
	];
</script>

<Group id="overlays" title="Overlays">
	<Notice tone="info" title="Two of these need JavaScript, and two do not">
		<code>Dropdown</code> is a native <code>&lt;details&gt;</code> and <code>ConfirmButton</code>
		posts a real form, so both work with JavaScript switched off. A <code>Modal</code> is opened by calling
		a method on the element, so its button does nothing without it.
	</Notice>

	<Example name="Modal" props="isOpen, title, onClose, children">
		<Button label="Open the modal" variant="secondary" type="button" onclick={handleOpenModal} />

		<Modal isOpen={isModalOpen} title="Move Amara to another committee" onClose={handleCloseModal}>
			<p>
				A modal traps the keyboard while it is open, dims the page behind it and closes on Escape.
				Tab round this one to see it.
			</p>
			<Button label="Got it" variant="primary" type="button" onclick={handleCloseModal} />
		</Modal>
	</Example>

	<Example
		name="ConfirmButton"
		props="label, confirmTitle, confirmText, formaction, variant soft-danger"
	>
		<ConfirmButton
			label="Withdraw application"
			confirmTitle="Withdraw this application?"
			confirmText="Your seat is given back to the conference and you cannot undo this."
			formaction={styleguideUrl()}
			variant="soft-danger"
		/>
	</Example>

	<Example name="ConfirmButton" props="children · fields the confirmed form carries">
		<ConfirmButton
			label="Delete account"
			confirmTitle="Delete your account?"
			confirmText="This removes your profile, applications and notifications."
			formaction={styleguideUrl()}
		>
			<TextField label="Type DELETE to confirm" name="confirmation" value="" />
		</ConfirmButton>
	</Example>

	<Example name="Dropdown" props="label, items with href">
		<Dropdown label="Actions" items={linkItems} />
	</Example>

	<Example name="Dropdown" props="icon · the label is then read by screen readers only">
		<Dropdown label="Row actions" icon={EllipsisVertical} items={postItems} />
	</Example>

	<Example name="Toast" props="message, tone · all four tones">
		<!--
			A `Toast` positions itself with `fixed`, so on a real page it floats in
			the corner of the window and only one is ever shown. All four would
			land on top of each other here, so each one is given a box of its own
			with `transform-gpu`: an element that carries a transform becomes the
			frame its fixed children are measured against, which pins each toast
			inside its own row. Only the styleguide needs this.
		-->
		<ul class="grid gap-3">
			{#each SAMPLE_MESSAGES as message (message.tone)}
				<li class="relative h-16 transform-gpu">
					<Toast message={message.title} tone={message.tone} />
				</li>
			{/each}
		</ul>
	</Example>
</Group>
