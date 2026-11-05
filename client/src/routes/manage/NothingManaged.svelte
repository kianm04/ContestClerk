<script lang="ts">
	import Landmark from '@lucide/svelte/icons/landmark';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { createConferenceUrl, forOrganisersUrl } from '$lib/urls';
</script>

<!-- What `/manage` shows somebody who organises nothing and helps with nothing. -->
<div class="flex flex-col gap-6">
	<EmptyState
		icon={Landmark}
		title="You are not organising anything yet."
		description="Create a conference to get an organisation and a management area."
		actionLabel="Create a conference"
		actionHref={createConferenceUrl()}
	/>

	<!-- The short explainer the page file asks for under the empty state: what
		running a conference here gives you, and where to read more. -->
	<div class="mx-auto max-w-prose text-body text-muted-foreground">
		<ul class="list-disc pl-5">
			<li>A public conference page and a listing in the directory.</li>
			<li>Applications, allocation and a team to run them with.</li>
			<li>Fees and invoices, once your organisation has connected Stripe.</li>
		</ul>

		<a
			href={forOrganisersUrl()}
			class="mt-2 inline-flex min-h-11 items-center text-small text-link hover:underline"
		>
			See what organisers get →
		</a>
	</div>
</div>
