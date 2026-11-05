/**
 * Pure helpers for `/resources`: the shape of one listed file, grouping the
 * reader's files by conference, the filter dropdown's options, and the
 * file-type word and icon `ResourceRow` shows next to a file's size.
 *
 * Nothing here imports from `$lib/server`, so both `+page.server.ts` and the
 * page's own components can use it, and it is tested without rendering
 * anything — the model `$lib/conferences.ts` and `$lib/schedule.ts` already
 * follow.
 */

import type { LucideIcon } from '@lucide/svelte';
import FileIcon from '@lucide/svelte/icons/file';
import FileTextIcon from '@lucide/svelte/icons/file-text';
import ImageIcon from '@lucide/svelte/icons/image';
import type { SelectOption } from '$lib/components/SelectField.svelte';

/** One resource or background guide, as `/resources` shows it. */
export type ResourceListItem = {
	id: string;
	title: string;
	fileName: string;
	fileSizeBytes: number;
	mimeType: string;
	kind: 'resource' | 'background_guide';
	conferenceId: string;
	conferenceName: string;
	conferenceSlug: string;
	/** The conference's square logo, or `null`. `Avatar` shows initials instead. */
	conferenceLogoPath: string | null;
	/** A background guide's committee, by abbreviation. `null` for a conference-level resource. */
	committeeLabel: string | null;
	/** A one-minute signed address, or `null` when Storage would not make one. */
	downloadUrl: string | null;
};

/** One conference's group of files, in the order `/resources` lists them. */
export type ResourceConferenceGroup = {
	conferenceId: string;
	conferenceName: string;
	conferenceSlug: string;
	conferenceLogoPath: string | null;
	resources: ResourceListItem[];
};

/**
 * The reader's files, folded into one group per conference.
 *
 * `listMyResources` already orders its answer by conference and then by
 * title, so this only has to keep that order as it groups; no conference
 * appears twice, and a group's own files stay in the order they arrived in.
 */
export function groupResourcesByConference(
	resources: ResourceListItem[]
): ResourceConferenceGroup[] {
	const groups: ResourceConferenceGroup[] = [];
	const groupsByConferenceId = new Map<string, ResourceConferenceGroup>();

	for (const resource of resources) {
		let group = groupsByConferenceId.get(resource.conferenceId);

		if (!group) {
			group = {
				conferenceId: resource.conferenceId,
				conferenceName: resource.conferenceName,
				conferenceSlug: resource.conferenceSlug,
				conferenceLogoPath: resource.conferenceLogoPath,
				resources: []
			};
			groupsByConferenceId.set(resource.conferenceId, group);
			groups.push(group);
		}

		group.resources.push(resource);
	}

	return groups;
}

/**
 * The conference filter's options: "All conferences" first, then one per
 * conference that has a resource, in the order they are grouped.
 */
export function resourceConferenceOptions(groups: ResourceConferenceGroup[]): SelectOption[] {
	return [
		{ value: '', label: 'All conferences' },
		...groups.map((group) => ({ value: group.conferenceSlug, label: group.conferenceName }))
	];
}

/** The word `ResourceRow` prints next to a file's size, read off its `mime_type`. */
const FILE_TYPE_LABELS: Record<string, string> = {
	'application/pdf': 'PDF',
	'image/jpeg': 'JPG',
	'image/png': 'PNG',
	'image/webp': 'WEBP',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX'
};

/** "PDF", "JPG"... or "FILE" for a type this list does not know. */
export function fileTypeLabel(mimeType: string): string {
	return FILE_TYPE_LABELS[mimeType] ?? 'FILE';
}

/** The icon `ResourceRow` shows beside a file: a picture for a picture, a page for everything else. */
export function fileTypeIcon(mimeType: string): LucideIcon {
	if (mimeType.startsWith('image/')) {
		return ImageIcon;
	}

	if (mimeType === 'application/pdf' || mimeType.includes('wordprocessingml')) {
		return FileTextIcon;
	}

	return FileIcon;
}
