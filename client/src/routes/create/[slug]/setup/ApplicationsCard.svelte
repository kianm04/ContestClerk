<script lang="ts">
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import CreationPanel from '$lib/components/creation/CreationPanel.svelte';
	import StatusChip, { type CreationStatus } from '$lib/components/creation/StatusChip.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { ApplicationQuestion } from '$lib/application-questions';
	import type { ApplicationsSummary } from '$lib/creation-setup-status';
	import { createSetupDialogUrl, manageApplicationFormUrl } from '$lib/urls';
	import ApplicationsFacts from './ApplicationsFacts.svelte';
	import PanelLink from './PanelLink.svelte';
	import QuestionList from './QuestionList.svelte';

	type Props = {
		slug: string;
		summary: ApplicationsSummary;
		questions: ApplicationQuestion[];
		status: CreationStatus;
		/** The quiet line for a deadline that has gone by, or `null`. */
		deadlineNote: string | null;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { slug, summary, questions, status, deadlineNote }: Props = $props();
</script>

<div id="applications" class="scroll-mt-24">
	<CreationPanel
		title="Applications"
		description="Configure how delegates can apply."
		icon={ClipboardList}
		size="small"
	>
		<!-- `{#snippet actions()}` fills the panel's space on the right of its title. -->
		{#snippet actions()}
			<div class="flex items-center gap-3.25">
				<StatusChip {status} />
				<Button
					variant="outline"
					href={createSetupDialogUrl(slug, 'applications')}
					class="h-8.5 gap-2 rounded-md border-creation-track bg-white px-3.5 fs-13 font-medium text-creation-blue hover:bg-creation-hover hover:text-creation-blue max-lg:min-h-11"
				>
					<Pencil class="size-4" aria-hidden="true" />
					Edit settings
				</Button>
				<PanelLink href={manageApplicationFormUrl(slug)} label="Application form" class="ml-1" />
			</div>
		{/snippet}

		<!-- The settings, then the custom questions, in one hairline box. -->
		<div class="mt-1.5 overflow-hidden rounded-lg border border-creation-card-border bg-white">
			<ApplicationsFacts {summary} />

			{#if deadlineNote}
				<p class="border-t border-creation-rule px-5 py-2 fs-13 text-creation-amber">
					{deadlineNote}
					<a href={createSetupDialogUrl(slug, 'applications')} class="text-creation-blue underline">
						Edit settings
					</a>
				</p>
			{/if}

			<div
				class="flex h-11 items-center border-t border-creation-rule pr-3 pl-5 max-lg:h-auto max-lg:py-1"
			>
				<h3 class="fs-14 font-semibold text-creation-ink-950">
					Custom questions ({questions.length})
				</h3>
				<Button
					variant="outline"
					href={createSetupDialogUrl(slug, 'question')}
					class="ml-auto h-8 gap-2 rounded-md border-creation-track bg-white px-3 fs-13 font-medium text-creation-blue hover:bg-creation-hover hover:text-creation-blue max-lg:min-h-11"
				>
					<Plus class="size-4" aria-hidden="true" />
					Add question
				</Button>
			</div>
			<QuestionList {slug} {questions} isCompact />
		</div>
	</CreationPanel>
</div>
