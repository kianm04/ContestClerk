<script lang="ts">
	import {
		noMatchingApplicationsMessage,
		type MyApplicationsQuery
	} from '$lib/my-applications-query';
	import { myApplicationsUrl } from '$lib/urls';
	import ListMessage from './ListMessage.svelte';

	type Props = {
		/** The search and tab that left nothing to show. */
		query: MyApplicationsQuery;
	};

	let { query }: Props = $props();

	// `$derived` works the words out again whenever the search or the tab changes.
	const message = $derived(noMatchingApplicationsMessage(query));
</script>

<!--
	An outline button: clearing a search or changing tab is a way back, not the
	thing the reader came to the page to do.
-->
<ListMessage
	title={message.title}
	description={message.description}
	actionLabel={message.actionLabel}
	actionHref={myApplicationsUrl(message.actionQuery)}
	actionVariant="outline"
/>
