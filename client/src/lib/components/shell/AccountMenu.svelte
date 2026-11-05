<script lang="ts">
	// `goto` moves to another page the way a link does, without reloading the app.
	import { goto } from '$app/navigation';
	import * as Avatar from '$lib/components/ui/avatar';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { publicMediaUrl } from '$lib/media';
	import { profileMenuItems } from '$lib/navigation';
	import { firstName } from '$lib/profiles';
	import { initials } from '$lib/text';
	import { cn } from '$lib/utils';

	type Props = {
		/** The signed-in person, whose picture and first name open the menu. */
		person: { fullName: string; avatarPath: string | null };
	};

	let { person }: Props = $props();

	const items = profileMenuItems();
</script>

<!--
	The account menu at the right of the top bar. It needs JavaScript to open.
	The trigger is the person's picture and, from `md` (768px) up, their first
	name; on a phone the name steps aside, so the button's name is in
	`aria-label`. Without a picture, `Avatar.Fallback` shows their initials.
-->
<DropdownMenu.Root>
	<DropdownMenu.Trigger
		aria-label={person.fullName}
		class={cn(buttonVariants({ variant: 'ghost' }), 'h-11 gap-2 px-1.5 md:pr-2.5')}
	>
		<Avatar.Root>
			{#if person.avatarPath}
				<Avatar.Image src={publicMediaUrl(person.avatarPath)} alt="" />
			{/if}
			<Avatar.Fallback>{initials(person.fullName)}</Avatar.Fallback>
		</Avatar.Root>
		<span class="hidden text-body md:inline">{firstName(person.fullName)}</span>
	</DropdownMenu.Trigger>

	<!-- `w-auto` lets the menu be wider than the button it opens from. -->
	<DropdownMenu.Content align="end" class="w-auto min-w-48">
		<DropdownMenu.Group>
			<!--
				A menu item is not a link, so choosing one moves to its page with
				`goto`. The `(item.href)` key lets Svelte reuse the items.
			-->
			{#each items as item (item.href)}
				<DropdownMenu.Item onSelect={() => goto(item.href)}>{item.label}</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
