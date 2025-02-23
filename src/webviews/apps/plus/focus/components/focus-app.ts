import {
	Badge,
	Button,
	defineGkElement,
	FocusContainer,
	Input,
	Menu,
	MenuItem,
	Popover,
} from '@gitkraken/shared-web-components';
import { html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { map } from 'lit/directives/map.js';
import { repeat } from 'lit/directives/repeat.js';
import { when } from 'lit/directives/when.js';
import type { State } from '../../../../../plus/webviews/focus/protocol';
import { debounce } from '../../../../../system/function';
import type { FeatureGate } from '../../../shared/components/feature-gate';
import type { FeatureGateBadge } from '../../../shared/components/feature-gate-badge';
import { themeProperties } from './gk-theme.css';
import '../../../shared/components/button';
import '../../../shared/components/code-icon';
import '../../../shared/components/feature-gate';
import '../../../shared/components/feature-gate-badge';
import './gk-pull-request-row';
import './gk-issue-row';

@customElement('gl-focus-app')
export class GlFocusApp extends LitElement {
	static override styles = [themeProperties];
	private readonly tabFilters = ['prs', 'issues'];
	private readonly tabFilterOptions = [
		{ label: 'All', value: '' },
		{ label: 'PRs', value: 'prs' },
		{ label: 'Issues', value: 'issues' },
	];
	private readonly mineFilters = ['authored', 'assigned', 'review-requested', 'mentioned'];
	private readonly mineFilterOptions = [
		{ label: 'Mine', value: '' },
		{ label: 'Opened by Me', value: 'authored' },
		{ label: 'Assigned to Me', value: 'assigned' },
		{ label: 'Needs my Review', value: 'review-requested' },
		{ label: 'Mentions Me', value: 'mentioned' },
	];
	@query('#subscription-gate', true)
	private subscriptionEl!: FeatureGate;

	@query('#connection-gate', true)
	private connectionEl!: FeatureGate;

	@query('#subscription-gate-badge', true)
	private subScriptionBadgeEl!: FeatureGateBadge;

	@state()
	private selectedTabFilter?: string;

	@state()
	private selectedMineFilter?: string;

	@state()
	private searchText?: string;

	@property({ type: Object })
	state?: State;

	constructor() {
		super();

		defineGkElement(Button, Badge, Input, FocusContainer, Popover, Menu, MenuItem);
	}

	get subscriptionState() {
		return this.state?.access.subscription.current;
	}

	get showSubscriptionGate() {
		return this.state?.access.allowed === false;
	}

	get showFeatureGate() {
		return this.state?.access.allowed !== true;
	}

	get showConnectionGate() {
		return this.state?.access.allowed === true && !(this.state?.repos?.some(r => r.isConnected) ?? false);
	}

	get mineFilterMenuLabel() {
		if (this.selectedMineFilter != null && this.selectedMineFilter !== '') {
			return this.mineFilterOptions.find(f => f.value === this.selectedMineFilter)?.label;
		}

		return this.mineFilterOptions[0].label;
	}

	get items() {
		if (this.isLoading) {
			return [];
		}

		const items: { isPullrequest: boolean; rank: number; state: Record<string, any>; tags: string[] }[] = [];

		let rank = 0;
		this.state?.pullRequests?.forEach(
			({ pullRequest, reasons, isCurrentBranch, isCurrentWorktree, hasWorktree, hasLocalBranch }) => {
				items.push({
					isPullrequest: true,
					state: {
						pullRequest: pullRequest,
						isCurrentBranch: isCurrentBranch,
						isCurrentWorktree: isCurrentWorktree,
						hasWorktree: hasWorktree,
						hasLocalBranch: hasLocalBranch,
					},
					rank: ++rank,
					tags: reasons,
				});
			},
		);
		this.state?.issues?.forEach(({ issue, reasons }) => {
			items.push({
				isPullrequest: false,
				rank: ++rank,
				state: {
					issue: issue,
				},
				tags: reasons,
			});
		});

		return items;
	}

	get tabFilterOptionsWithCounts() {
		const counts: Record<string, number> = {};
		this.tabFilters.forEach(f => (counts[f] = 0));

		this.items.forEach(({ isPullrequest }) => {
			const key = isPullrequest ? 'prs' : 'issues';
			if (counts[key] != null) {
				counts[key]++;
			}
		});

		return this.tabFilterOptions.map(o => {
			return {
				...o,
				count: o.value === '' ? this.items.length : counts[o.value],
			};
		});
	}

	get filteredItems() {
		if (this.items.length === 0) {
			return this.items;
		}

		const hasSearch = this.searchText != null && this.searchText !== '';
		const hasMineFilter = this.selectedMineFilter != null && this.selectedMineFilter !== '';
		const hasTabFilter = this.selectedTabFilter != null && this.selectedTabFilter !== '';
		if (!hasSearch && !hasMineFilter && !hasTabFilter) {
			return this.items;
		}

		const searchText = this.searchText?.toLowerCase();
		return this.items.filter(i => {
			if (
				hasTabFilter &&
				((i.isPullrequest === true && this.selectedTabFilter === 'issues') ||
					(i.isPullrequest === false && this.selectedTabFilter === 'prs'))
			) {
				return false;
			}

			if (hasMineFilter && !i.tags.includes(this.selectedMineFilter!)) {
				return false;
			}

			if (hasSearch) {
				if (i.state.issue && !i.state.issue.title.toLowerCase().includes(searchText)) {
					return false;
				}

				if (i.state.pullRequest && !i.state.pullRequest.title.toLowerCase().includes(searchText)) {
					return false;
				}
			}

			return true;
		});
	}

	get isLoading() {
		return this.state?.pullRequests == null || this.state?.issues == null;
	}

	loadingContent() {
		return html`
			<div class="alert">
				<span class="alert__content"><code-icon modifier="spin" icon="loading"></code-icon> Loading</span>
			</div>
		`;
	}

	focusItemsContent() {
		if (this.isLoading) {
			return this.loadingContent();
		}

		if (this.filteredItems.length === 0) {
			return html`
				<div class="alert">
					<span class="alert__content">None found</span>
				</div>
			`;
		}

		return html`
			${repeat(
				this.filteredItems,
				item => item.rank,
				({ isPullrequest, rank, state }) =>
					when(
						isPullrequest,
						() =>
							html`<gk-pull-request-row
								.rank=${rank}
								.pullRequest=${state.pullRequest}
								.isCurrentBranch=${state.isCurrentBranch}
								.isCurrentWorktree=${state.isCurrentWorktree}
								.hasWorktree=${state.hasWorktree}
								.hasLocalBranch=${state.hasLocalBranch}
							></gk-pull-request-row>`,
						() => html`<gk-issue-row .rank=${rank} .issue=${state.issue}></gk-issue-row>`,
					),
			)}
		`;
	}

	override render() {
		if (this.state == null) {
			return this.loadingContent();
		}

		return html`
			<div class="app">
				<div class="app__toolbar">
					<span class="preview">Preview</span>
					<gk-feature-gate-badge
						.subscription=${this.subscriptionState}
						id="subscription-gate-badge"
					></gk-feature-gate-badge>
					<gk-button
						class="feedback"
						appearance="toolbar"
						href="https://github.com/gitkraken/vscode-gitlens/discussions/2535"
						title="Focus View Feedback"
						aria-label="Focus View Feedback"
						><code-icon icon="feedback"></code-icon
					></gk-button>
				</div>

				<div class="app__content">
					<gk-feature-gate
						.state=${this.subscriptionState?.state}
						.visible=${this.showFeatureGate}
						id="subscription-gate"
						class="scrollable"
						><p slot="feature">
							Brings all of your GitHub pull requests and issues into a unified actionable view to help to
							you more easily juggle work in progress, pending work, reviews, and more. Quickly see if
							anything requires your attention while keeping you focused.
						</p></gk-feature-gate
					>
					<gk-feature-gate .visible=${this.showConnectionGate} id="connection-gate" class="scrollable">
						<h3>No GitHub remotes are connected</h3>
						<p>
							This enables access to Pull Requests and Issues in the Focus View as well as provide
							additional information inside hovers and the Commit Details view, such as auto-linked issues
							and pull requests and avatars.
						</p>
						<gl-button appearance="alert" href="command:gitlens.connectRemoteProvider"
							>Connect to GitHub</gl-button
						>
					</gk-feature-gate>

					<div class="app__focus">
						<header class="app__header">
							<div class="app__header-group">
								<nav class="tab-filter" id="filter-focus-items">
									${map(
										this.tabFilterOptionsWithCounts,
										({ label, value, count }, i) => html`
											<button
												class="tab-filter__tab ${(
													this.selectedTabFilter ? value === this.selectedTabFilter : i === 0
												)
													? 'is-active'
													: ''}"
												type="button"
												data-tab="${value}"
												@click=${() => (this.selectedTabFilter = value)}
											>
												${label} <gk-badge variant="filled">${count}</gk-badge>
											</button>
										`,
									)}
								</nav>
								<gk-popover>
									<gk-button slot="trigger"
										><code-icon icon="list-filter"></code-icon> ${this.mineFilterMenuLabel}
										<code-icon icon="chevron-down"></code-icon
									></gk-button>
									<gk-menu class="mine-menu" @select=${this.onSelectMineFilter}>
										${map(
											this.mineFilterOptions,
											({ label, value }, i) => html`
												<gk-menu-item
													data-value="${value}"
													?disabled=${this.selectedMineFilter
														? value === this.selectedMineFilter
														: i === 0}
													>${label}</gk-menu-item
												>
											`,
										)}
									</gk-menu>
								</gk-popover>
							</div>
							<div class="app__header-group">
								<gk-input
									class="app__search"
									label="Search field"
									label-visibility="sr-only"
									placeholder="Search"
									@input=${debounce(this.onSearchInput.bind(this), 200)}
								>
									<code-icon slot="prefix" icon="search"></code-icon>
								</gk-input>
							</div>
						</header>
						<main class="app__main">
							<gk-focus-container id="list-focus-items">
								<span slot="key"><code-icon icon="circle-large-outline"></code-icon></span>
								<span slot="date"><code-icon icon="gl-clock"></code-icon></span>
								<span slot="repo">Repo / Branch</span>
								${this.focusItemsContent()}
							</gk-focus-container>
						</main>
					</div>
				</div>
			</div>
		`;
	}

	onSearchInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const value = input.value;

		if (value === '' || value.length < 3) {
			this.searchText = undefined;
			return;
		}

		this.searchText = value;
	}

	onSelectMineFilter(e: CustomEvent<{ target: MenuItem }>) {
		const target = e.detail?.target;
		if (target?.dataset?.value != null) {
			this.selectedMineFilter = target.dataset.value;

			const menuEl: Popover | null = target.closest('gk-popover');
			menuEl?.hidePopover();
		}
	}

	protected override createRenderRoot() {
		return this;
	}
}
