<script lang="ts">
	import Bell from '@lucide/svelte/icons/bell';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Mail from '@lucide/svelte/icons/mail';
	import type { SettingsCard, SettingsMessage } from '$lib/accounts';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Section from '$lib/components/Section.svelte';
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import ChangeEmailForm from './ChangeEmailForm.svelte';
	import ChangePasswordForm from './ChangePasswordForm.svelte';
	import DeleteAccountForm from './DeleteAccountForm.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned, and it is read
	// again after every action on this page. `form` is what the last action
	// returned, and is `null` until one has run.
	let { data, form }: PageProps = $props();

	/**
	 * The message the last action left, but only when it belongs to this card.
	 *
	 * All three forms are on one page and share the one `form` result, so
	 * without this a failed password change would also appear under the email
	 * field.
	 */
	function messageForCard(card: SettingsCard): SettingsMessage | null {
		return form?.message?.card === card ? form.message : null;
	}

	// `$derived` works each of these out again after every submit.
	const emailMessage = $derived(messageForCard('email'));
	const passwordMessage = $derived(messageForCard('password'));
	const deleteMessage = $derived(messageForCard('delete'));
</script>

<PageMeta title="Settings" description="Change your email or password, or delete your account." />

<div class="mx-auto max-w-[640px]">
	<div class="mb-6">
		<PageHeader title="Settings" />
	</div>

	<div class="flex flex-col gap-6">
		<!-- Each `Section` is a card with an icon beside its title, the way the dashboards draw theirs. -->
		<Section title="Email" icon={Mail}>
			<ChangeEmailForm
				currentEmail={data.email}
				pendingEmail={data.pendingEmail}
				typedEmail={form?.email ?? ''}
				message={emailMessage}
			/>
		</Section>

		<Section title="Password" icon={KeyRound}>
			<ChangePasswordForm message={passwordMessage} />
		</Section>

		<Section title="Notifications" icon={Bell}>
			<p class="text-body text-ink-600">Email notifications are coming. For now, see the bell.</p>
		</Section>

		<DeleteAccountForm soleOwnerships={data.soleOwnerships} message={deleteMessage} />
	</div>
</div>
