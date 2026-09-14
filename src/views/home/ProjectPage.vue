<template>
  <main class="desktop">
    <header class="desktop__toolbar">
      <RouterLink
        class="desktop__project-link"
        :to="desktopLocation(projectKey)"
        :title="projectName"
        :aria-label="projectKey ? '返回项目：' + projectName : '所有项目'"
      >
        {{ projectName }}
      </RouterLink>
      <button
        v-if="tree?.project.permissions.manage"
        class="desktop__button"
        type="button"
        :disabled="loading || busy"
        @click="privilegesOpen = true"
      >
        项目权限
      </button>
    </header>

    <div class="desktop__navigation">
      <nav class="desktop__breadcrumbs" aria-label="文件夹路径">
        <ol class="desktop__breadcrumb-list">
          <li
            v-for="(folder, index) in path"
            :key="folder.folder_key"
            class="desktop__breadcrumb-item"
          >
            <SvgIcon
              v-if="index"
              class="desktop__breadcrumb-separator"
              name="chevron-right"
              :size="12"
            />
            <span
              v-if="folder.folder_key === folderKey"
              class="desktop__breadcrumb desktop__breadcrumb--current"
              aria-current="page"
            >
              <SvgIcon v-if="!index" name="folder" :size="13" />
              {{ folder.name }}
            </span>
            <RouterLink
              v-else
              class="desktop__breadcrumb"
              :to="desktopLocation(projectKey, folder.folder_key)"
            >
              <SvgIcon v-if="!index" name="folder" :size="13" />
              {{ folder.name }}
            </RouterLink>
          </li>
        </ol>
      </nav>
      <div class="desktop__toolbar-actions">
        <div class="desktop__view" role="group" aria-label="展示方式">
          <button
            class="desktop__icon-button"
            type="button"
            :class="{ 'desktop__icon-button--selected': view === 'grid' }"
            :aria-pressed="view === 'grid'"
            title="网格布局"
            aria-label="网格布局"
            @click="setView('grid')"
          >
            <SvgIcon name="grid" :size="15" />
          </button>
          <button
            class="desktop__icon-button"
            type="button"
            :class="{ 'desktop__icon-button--selected': view === 'list' }"
            :aria-pressed="view === 'list'"
            title="列表布局"
            aria-label="列表布局"
            @click="setView('list')"
          >
            <SvgIcon name="list" :size="16" />
          </button>
        </div>
        <button
          v-if="!folderKey"
          class="desktop__icon-button desktop__create"
          type="button"
          :title="projectKey ? '创建文件夹' : '创建项目'"
          :aria-label="projectKey ? '创建文件夹' : '创建项目'"
          :disabled="loading || busy || creating || !canWrite"
          @click="createDirectory"
        >
          <SvgIcon name="add" :size="18" />
        </button>
        <button
          v-if="folderKey"
          class="desktop__icon-button desktop__create"
          type="button"
          title="创建文件"
          aria-label="创建文件"
          :disabled="loading || busy || creating || !canWrite"
          @click="createFile"
        >
          <SvgIcon name="page" :size="14" />
        </button>
        <button
          class="desktop__icon-button"
          type="button"
          title="刷新目录"
          aria-label="刷新目录"
          :disabled="loading || busy"
          @click="load"
        >
          <SvgIcon name="refresh" :size="14" />
        </button>
      </div>
    </div>

    <section class="desktop__content" :aria-busy="loading" aria-label="目录内容">
      <div class="desktop__content-inner">
        <div v-if="loading" class="desktop__state" role="status">
          <span class="desktop__spinner" aria-hidden="true"></span>
          <p class="desktop__state-description">正在加载目录…</p>
        </div>
        <div v-else-if="error" class="desktop__state" role="alert">
          <SvgIcon class="desktop__state-icon" name="alert" :size="32" />
          <h2 class="desktop__state-title">无法加载目录</h2>
          <p class="desktop__state-description">{{ error }}</p>
          <div class="desktop__state-actions">
            <button class="desktop__button" type="button" @click="load">重新加载</button>
            <RouterLink
              v-if="projectKey"
              class="desktop__button"
              :to="folderKey ? desktopLocation(projectKey) : desktopLocation()"
            >
              {{ folderKey ? '返回项目' : '所有项目' }}
            </RouterLink>
          </div>
        </div>
        <div v-else-if="!entries.length" class="desktop__state">
          <SvgIcon class="desktop__state-icon" name="folder-open" :size="40" />
          <h2 class="desktop__state-title">{{ projectKey ? '此目录为空' : '尚无项目' }}</h2>
          <p class="desktop__state-description">
            {{
              folderKey
                ? '创建一个文件，开始记录内容。'
                : projectKey
                  ? '创建一个文件夹，开始整理内容。'
                  : '创建一个项目，开始整理内容。'
            }}
          </p>
          <button
            class="desktop__button"
            type="button"
            :disabled="busy || !canWrite"
            @click="folderKey ? createFile() : createDirectory()"
          >
            <SvgIcon name="add" :size="16" />
            {{ folderKey ? '创建文件' : projectKey ? '创建文件夹' : '创建项目' }}
          </button>
        </div>
        <template v-else>
          <div v-if="view === 'list'" class="desktop__list-heading" aria-hidden="true">
            <span>名称</span><span class="desktop__type-column">类型</span>
            <span class="desktop__time-column">修改时间</span><span>操作</span>
          </div>
          <ul
            class="desktop__entries"
            :class="{
              'desktop__entries--grid': view === 'grid',
              'desktop__entries--list': view === 'list',
            }"
          >
            <li
              v-for="entry in pageEntries"
              :key="entry.kind + '-' + entry.key"
              class="desktop__entry"
            >
              <RouterLink
                :to="entry.location"
                class="desktop__entry-link"
                :title="entry.name"
                :aria-label="entry.name + '，' + entry.typeLabel"
              >
                <span
                  class="desktop__entry-icon"
                  :class="{ 'desktop__entry-icon--file': entry.kind === 'document' }"
                >
                  <SvgIcon :name="entry.kind === 'document' ? 'page' : 'folder'" size="100%" />
                </span>
                <span class="desktop__entry-name">{{ entry.name }}</span>
              </RouterLink>
              <span class="desktop__entry-type">{{ entry.typeLabel }}</span>
              <time class="desktop__entry-time" :datetime="entry.updated_at">
                {{ formatTime(entry.updated_at) }}
              </time>
              <div class="desktop__entry-actions">
                <button
                  class="desktop__icon-button"
                  type="button"
                  :aria-label="'重命名' + entry.name"
                  title="重命名"
                  :disabled="!entry.writable || busy"
                  @click="rename(entry)"
                >
                  <SvgIcon name="write" :size="14" />
                </button>
                <button
                  class="desktop__icon-button desktop__icon-button--danger"
                  type="button"
                  :aria-label="'删除' + entry.name"
                  :title="deleteReason(entry) || '删除'"
                  :disabled="Boolean(deleteReason(entry)) || busy"
                  @click="remove(entry)"
                >
                  <SvgIcon name="trash" :size="14" />
                </button>
              </div>
            </li>
          </ul>
          <nav v-if="pageCount > 1" class="desktop__pagination" aria-label="目录分页">
            <button
              class="desktop__button"
              type="button"
              :disabled="page <= 1"
              @click="setPage(page - 1)"
            >
              上一页
            </button>
            <span>第 {{ page }} / {{ pageCount }} 页 · 每页 {{ PAGE_SIZE }} 项</span>
            <button
              class="desktop__button"
              type="button"
              :disabled="page >= pageCount"
              @click="setPage(page + 1)"
            >
              下一页
            </button>
          </nav>
        </template>
      </div>
    </section>
    <footer class="desktop__footer">
      <span v-if="!loading && !error" class="desktop__count">{{ entries.length }} 项</span>
    </footer>
    <ProjectPrivilegesDialog
      v-if="tree"
      v-model="privilegesOpen"
      :project="tree.project"
      @saved="permissionsSaved"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router';
import SvgIcon from '@/components/SvgIcon.vue';
import {
  queryProjects,
  getProjectTree,
  createProject,
  renameProject,
  deleteProject,
  createFolder,
  renameFolder,
  deleteFolder,
  type ProjectInfo,
  type ProjectTree,
} from '@/service/api/workspace-api';
import { updateDocument, deleteDocument } from '@/service/api/document-api';
import { folderAncestors, formatTime } from '@/utils/workspace';
import { errorMessage } from '@/utils/error';
import { useConfirm } from '@/composables/useConfirm';
import { useCreateDocument } from '@/composables/useCreateDocument';
import { useModalStore, ModalType } from '@/stores/modal';
import { useNotificationStore } from '@/stores/notification';
import { MessageType } from '@/constant/status';
import ProjectPrivilegesDialog from '@/components/team/ProjectPrivilegesDialog.vue';
import { useTeamStore } from '@/stores/team';

interface Entry {
  key: string;
  kind: 'project' | 'folder' | 'document';
  name: string;
  typeLabel: string;
  updated_at: string;
  location: RouteLocationRaw;
  writable: boolean;
  manageable: boolean;
}

const route = useRoute();
const router = useRouter();
const modal = useModalStore();
const notification = useNotificationStore();
const teams = useTeamStore();
const privilegesOpen = ref(false);
const currentTeam = computed(() =>
  teams.resolve(typeof route.query.team_key === 'string' ? route.query.team_key : undefined)
);
const { confirm } = useConfirm();
const { creating, openCreateDocument } = useCreateDocument();
const projects = ref<ProjectInfo[]>([]);
const tree = ref<ProjectTree | null>(null);
const loading = ref(true);
const busy = ref(false);
const loadError = ref('');
const view = ref<'grid' | 'list'>('grid');
try {
  if (localStorage.getItem('voex-desktop-view') === 'list') view.value = 'list';
} catch {
  /* Storage restrictions must not prevent directory browsing. */
}
const projectKey = computed(() =>
  typeof route.params.projectId === 'string' ? route.params.projectId || undefined : undefined
);
const folderKey = computed(() =>
  typeof route.params.folderId === 'string' ? route.params.folderId || undefined : undefined
);
const error = computed(() => {
  if (loadError.value) return loadError.value;
  if (loading.value || !folderKey.value) return '';
  if (!projectKey.value) return '目录地址缺少所属项目，请返回主页';
  if (tree.value && !tree.value.folders.some((folder) => folder.folder_key === folderKey.value))
    return '文件夹不存在或已被删除，请返回项目';
  return '';
});
const path = computed(() => folderAncestors(tree.value?.folders ?? [], folderKey.value));
const projectName = computed(() =>
  projectKey.value
    ? tree.value?.project.name ||
      projects.value.find((project) => project.project_key === projectKey.value)?.name ||
      '项目'
    : currentTeam.value?.name || '团队项目'
);
const title = computed(() =>
  folderKey.value
    ? path.value.at(-1)?.name || '文件夹'
    : projectKey.value
      ? tree.value?.project.name || '项目'
      : currentTeam.value?.name || '团队项目'
);
const canWrite = computed(
  () =>
    !error.value &&
    (projectKey.value
      ? tree.value?.project.permissions.write === true
      : currentTeam.value?.permissions.write === true)
);
const PAGE_SIZE = 48;
const pageCount = computed(() => Math.max(1, Math.ceil(entries.value.length / PAGE_SIZE)));
const page = computed(() =>
  Math.min(pageCount.value, Math.max(1, Math.floor(Number(route.query.page)) || 1))
);
const pageEntries = computed(() =>
  entries.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE)
);
let controller: AbortController | undefined;
let generation = 0;

function desktopLocation(projectId = '', folderId = ''): RouteLocationRaw {
  return {
    name: 'project',
    params: { projectId, folderId },
    query: { team_key: currentTeam.value?.team_key },
  };
}

const entries = computed<Entry[]>(() => {
  if (!projectKey.value)
    return projects.value.map((project) => ({
      key: project.project_key,
      kind: 'project',
      name: project.name,
      typeLabel: '项目',
      updated_at: project.updated_at,
      location: desktopLocation(project.project_key),
      writable: project.permissions.write,
      manageable: project.permissions.write,
    }));
  if (!tree.value) return [];
  const permissions = tree.value.project.permissions;
  return [
    ...tree.value.folders
      .filter((folder) => !folderKey.value && folder.parent_key === null)
      .map((folder): Entry => ({
        key: folder.folder_key,
        kind: 'folder',
        name: folder.name,
        typeLabel: '文件夹',
        updated_at: folder.updated_at,
        location: desktopLocation(projectKey.value, folder.folder_key),
        writable: permissions.write,
        manageable: permissions.write,
      })),
    ...tree.value.documents
      .filter((doc) => doc.folder_key === folderKey.value)
      .map((doc): Entry => ({
        key: doc.file_key,
        kind: 'document',
        name: doc.file_name,
        typeLabel: '文件',
        updated_at: doc.updated_at,
        location: { name: 'edit', params: { file_key: doc.file_key } },
        writable: permissions.write,
        manageable: permissions.write,
      })),
  ];
});

async function load() {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const current = ++generation;
  const project = projectKey.value;
  loading.value = true;
  loadError.value = '';
  tree.value = null;
  try {
    await teams.ensure();
    if (signal.aborted || current !== generation) return;
    if (project) {
      const nextTree = await getProjectTree(project, signal);
      if (signal.aborted || current !== generation) return;
      if (route.query.team_key !== nextTree.project.team_key) {
        await router.replace({ query: { ...route.query, team_key: nextTree.project.team_key } });
        return;
      }
      tree.value = nextTree;
    }
    if (!currentTeam.value) throw new Error('团队不存在或你已不在该团队');
    const result = await queryProjects(signal, currentTeam.value.team_key);
    if (signal.aborted || current !== generation) return;
    projects.value = result;
  } catch (cause) {
    if (signal.aborted || current !== generation) return;
    loadError.value = errorMessage(cause, '目录加载失败');
  } finally {
    if (current === generation) loading.value = false;
  }
}

function setView(value: 'grid' | 'list') {
  view.value = value;
  try {
    localStorage.setItem('voex-desktop-view', value);
  } catch {
    /* Keep the in-memory preference. */
  }
}

function setPage(value: number) {
  void router.replace({ query: { ...route.query, page: value > 1 ? String(value) : undefined } });
}

function createFile() {
  if (loading.value || busy.value || creating.value || !canWrite.value || !folderKey.value) return;
  openCreateDocument({ project_key: projectKey.value, folder_key: folderKey.value });
}

function createDirectory() {
  const project = projectKey.value;
  const selected = currentTeam.value;
  if (
    folderKey.value ||
    loading.value ||
    busy.value ||
    creating.value ||
    !canWrite.value ||
    !selected
  )
    return;
  modal.showModal(ModalType.INPUT_DIALOG, {
    title: project ? '新建文件夹' : '新建项目',
    tips: project ? '文件夹名称' : '项目名称',
    okText: '创建',
    onOK: async (name) => {
      if (project) await createFolder({ project_key: project, parent_key: null, name });
      else await createProject(name, selected.team_key);
      teams.invalidateProjects();
      notification.show(project ? '文件夹已创建' : '项目已创建', 'success');
      await load();
    },
  });
}

function rename(entry: Entry) {
  if (!entry.writable || busy.value) return;
  modal.showModal(ModalType.INPUT_DIALOG, {
    title: `重命名${entry.typeLabel}`,
    tips: `${entry.typeLabel}名称`,
    defaultValue: entry.name,
    okText: '保存',
    onOK: async (name) => {
      if (entry.kind === 'project') await renameProject(entry.key, name);
      else if (entry.kind === 'folder') await renameFolder(entry.key, name);
      else await updateDocument(entry.key, { file_name: name });
      notification.show('名称已更新', 'success');
      teams.invalidateProjects();
      await load();
    },
  });
}

function deleteReason(entry: Entry): string {
  if (!entry.manageable) return '没有删除权限';
  if (
    entry.kind === 'folder' &&
    tree.value &&
    (tree.value.folders.some((folder) => folder.parent_key === entry.key) ||
      tree.value.documents.some((doc) => doc.folder_key === entry.key))
  )
    return '仅允许删除空文件夹';
  return '';
}

async function remove(entry: Entry) {
  if (deleteReason(entry) || busy.value) return;
  busy.value = true;
  try {
    const accepted = await confirm({
      type: MessageType.ERROR,
      title: `删除${entry.typeLabel}`,
      confirmText: '删除',
      content:
        entry.kind === 'document'
          ? `删除「${entry.name}」及其附件关联？此操作无法撤销。`
          : `删除${entry.typeLabel}「${entry.name}」？仅允许删除空${entry.typeLabel}，此操作无法撤销。`,
    });
    if (!accepted) return;
    if (entry.kind === 'project') await deleteProject(entry.key);
    else if (entry.kind === 'folder') await deleteFolder(entry.key);
    else await deleteDocument(entry.key);
    notification.show(`${entry.typeLabel}已删除`, 'success');
    teams.invalidateProjects();
    await load();
  } catch (cause) {
    notification.show(errorMessage(cause), 'error', 0);
  } finally {
    busy.value = false;
  }
}

// Home keys this page by project; folder navigation reuses the loaded tree.
function permissionsSaved() {
  teams.invalidateProjects();
  void load();
}
onMounted(load);
watch(
  [title, error, loading],
  () => {
    document.title = `${loading.value ? '正在加载目录' : error.value ? '目录不可用' : title.value} · Voex`;
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  controller?.abort();
  generation++;
});
</script>

<style scoped lang="stylus">
.desktop
  position relative
  z-index 1
  display flex
  flex-direction column
  width 100%
  height 100%
  min-width 0
  min-height 0
  overflow hidden
  container-type inline-size
  color var(--color-text-secondary)
  font-size 13px
  line-height 20px

.desktop__toolbar
  display flex
  flex-shrink 0
  align-items center
  justify-content space-between
  gap 16px
  height 44px
  padding 0 12px
  border-bottom 1px solid var(--color-border-translucent)

.desktop__project-link
  min-width 0
  padding 4px 6px
  overflow hidden
  border-radius var(--border-radius-item-s)
  color var(--color-text-secondary)
  font-size 12px
  font-weight 600
  text-decoration none
  text-overflow ellipsis
  white-space nowrap

.desktop__project-link:hover
  background var(--color-bg-translucent)
  color var(--color-text-primary)

.desktop__navigation
  display flex
  flex-shrink 0
  align-items flex-start
  gap 12px
  min-height 44px
  padding 8px

.desktop__toolbar-actions
  display flex
  flex-shrink 0
  align-items center
  gap 6px

.desktop__toolbar-actions .desktop__icon-button
  border 1px solid var(--color-border-translucent-strong)
  border-radius 50%
  background var(--color-bg-translucent)

.desktop__toolbar-actions .desktop__icon-button:hover:not(:disabled)
  border-color var(--color-border-secondary)
  background var(--color-bg-quaternary)

.desktop__toolbar-actions .desktop__icon-button--selected
  border-color var(--color-border-secondary)
  background var(--color-bg-quaternary)
  color var(--color-text-primary)

.desktop__view
  display flex
  align-items center
  gap 6px

.desktop__icon-button
  display inline-flex
  flex-shrink 0
  align-items center
  justify-content center
  width 28px
  height 28px
  border-radius var(--border-radius-item-s)
  color var(--color-text-tertiary)
  cursor pointer

.desktop__icon-button:hover:not(:disabled)
  background var(--color-bg-translucent)
  color var(--color-text-primary)

.desktop__icon-button:active:not(:disabled)
  background var(--color-bg-quaternary)

.desktop__icon-button--selected
  background var(--color-bg-translucent)
  color var(--color-text-secondary)

.desktop__icon-button--danger:hover:not(:disabled)
  color var(--color-red)

.desktop__icon-button:disabled
  cursor not-allowed
  opacity .4

.desktop__icon-button:focus-visible,
.desktop__project-link:focus-visible,
.desktop__breadcrumb:focus-visible,
.desktop__entry-link:focus-visible,
.desktop__button:focus-visible
  outline 2px solid var(--color-accent)
  outline-offset -2px

.desktop__create
  color var(--color-text-secondary)

.desktop__breadcrumbs
  flex 1
  min-width 0
  min-height 28px
  max-height 112px
  overflow-y auto

.desktop__breadcrumb-list
  display flex
  flex-wrap wrap
  align-items center
  gap 4px
  margin 0
  padding 0
  list-style none

.desktop__breadcrumb-item
  display flex
  align-items center
  gap 4px
  min-width 0
  max-width 100%

.desktop__breadcrumb-separator
  color var(--color-text-quaternary)

.desktop__breadcrumb
  display inline-flex
  align-items center
  gap 6px
  min-width 0
  padding 3px 10px
  border 1px solid var(--color-border-translucent)
  border-radius 20px
  color var(--color-text-tertiary)
  font-size 12px
  line-height 20px
  overflow-wrap anywhere
  text-decoration none

.desktop__breadcrumb:hover
  background var(--color-bg-translucent)
  color var(--color-text-secondary)

.desktop__breadcrumb--current
  background var(--color-bg-translucent)
  color var(--color-text-secondary)
  font-weight 600

.desktop__content
  flex 1
  min-height 0
  padding 24px 32px 32px
  overflow-y auto
  overscroll-behavior contain
  scrollbar-gutter stable

.desktop__content-inner
  width 100%
  max-width 800px
  margin 0 auto

.desktop__footer
  display flex
  flex-shrink 0
  align-items center
  justify-content flex-end
  min-height 32px
  padding 4px 12px

.desktop__count
  color var(--color-text-quaternary)
  font-size 12px
  white-space nowrap

.desktop__entries
  margin 0
  padding 0
  list-style none

.desktop__entry
  min-width 0

.desktop__entry-link
  display flex
  min-width 0
  border-radius var(--border-radius-item-s)
  color var(--color-text-secondary)
  text-decoration none

.desktop__entry-link:hover
  color var(--color-text-primary)

.desktop__entry-icon
  display flex
  flex-shrink 0
  align-items center
  justify-content center
  color var(--color-blue)

.desktop__entry-icon--file
  color var(--color-text-tertiary)

.desktop__entry-name
  min-width 0
  overflow hidden
  font-size 13px
  font-weight 500
  text-overflow ellipsis
  white-space nowrap

.desktop__entry-type,
.desktop__entry-time
  color var(--color-text-tertiary)
  font-size 12px
  line-height 18px

.desktop__entry-time
  white-space nowrap

.desktop__entry-actions
  display flex
  flex-shrink 0
  align-items center
  justify-content flex-end
  gap 2px

.desktop__entries--grid
  display grid
  grid-template-columns repeat(auto-fill, minmax(180px, 1fr))
  gap 14px

.desktop__entries--grid .desktop__entry
  display grid
  grid-template-columns minmax(0, 1fr) auto
  align-items center
  gap 4px 8px
  padding 14px
  border 1px solid var(--color-border-translucent-strong)
  border-radius var(--border-radius-item-m)
  background var(--color-bg-translucent)

.desktop__entries--grid .desktop__entry:hover
  border-color var(--color-border-secondary)

.desktop__entries--grid .desktop__entry-link
  grid-column 1 / -1
  flex-direction column
  align-items flex-start
  gap 16px
  min-height 82px
  padding 2px 0 10px

.desktop__entries--grid .desktop__entry-icon
  width 30px
  height 30px

.desktop__entries--grid .desktop__entry-name
  max-width 100%

.desktop__entries--grid .desktop__entry-time
  grid-column 1 / -1
  grid-row 3

.desktop__entries--list .desktop__entry,
.desktop__list-heading
  display grid
  grid-template-columns minmax(0, 1fr) 60px 150px 58px
  align-items center
  gap 16px
  padding 0 12px

.desktop__list-heading
  min-height 32px
  border-bottom 1px solid var(--color-border-translucent)
  color var(--color-text-quaternary)
  font-size 11px

.desktop__entries--list .desktop__entry
  min-height 58px
  border-bottom 1px solid var(--color-border-translucent)

.desktop__entries--list .desktop__entry:hover
  background var(--color-bg-translucent)

.desktop__entries--list .desktop__entry-link
  align-items center
  gap 12px
  padding 10px 0

.desktop__entries--list .desktop__entry-icon
  width 20px
  height 20px

.desktop__state
  display flex
  flex-direction column
  align-items center
  justify-content center
  gap 12px
  min-height 280px
  padding 32px 16px
  text-align center

.desktop__state-icon
  color var(--color-text-quaternary)

.desktop__state-title
  margin 0
  color var(--color-text-secondary)
  font-size 14px
  font-weight 500

.desktop__state-description
  max-width 360px
  color var(--color-text-tertiary)
  font-size 13px
  overflow-wrap anywhere

.desktop__state-actions
  display flex
  justify-content center
  flex-wrap wrap
  gap 8px

.desktop__button
  display inline-flex
  align-items center
  justify-content center
  gap 6px
  min-height 30px
  padding 4px 12px
  border 1px solid var(--color-border-translucent-strong)
  border-radius var(--border-radius-item-s)
  background var(--color-bg-translucent)
  color var(--color-text-secondary)
  font-size 12px
  text-decoration none
  white-space nowrap
  cursor pointer

.desktop__button:hover:not(:disabled)
  background var(--color-bg-quaternary)
  color var(--color-text-primary)

.desktop__button:active:not(:disabled)
  filter brightness(.94)

.desktop__button:disabled
  cursor not-allowed
  opacity .4

.desktop__pagination
  display flex
  flex-wrap wrap
  align-items center
  justify-content center
  gap 12px
  margin-top 28px
  color var(--color-text-tertiary)
  font-size 12px

.desktop__spinner
  width 22px
  height 22px
  border 2px solid var(--color-border-primary)
  border-top-color var(--color-text-tertiary)
  border-radius 50%
  animation desktop-spin .8s linear infinite

@container (max-width: 640px)
  .desktop__content
    padding 16px 12px 24px

  .desktop__entries--list .desktop__entry,
  .desktop__list-heading
    grid-template-columns minmax(0, 1fr) 126px 58px
    gap 10px
    padding 0 6px

  .desktop__type-column,
  .desktop__entries--list .desktop__entry-type
    display none

@container (max-width: 440px)
  .desktop__toolbar
    padding 0 4px

  .desktop__toolbar-actions
    gap 6px

  .desktop__entries--grid
    grid-template-columns repeat(2, minmax(0, 1fr))
    gap 10px

  .desktop__entries--grid .desktop__entry
    padding 10px

  .desktop__entries--grid .desktop__entry-time
    white-space normal

  .desktop__entries--list .desktop__entry,
  .desktop__list-heading
    grid-template-columns minmax(0, 1fr) 58px

  .desktop__time-column,
  .desktop__entries--list .desktop__entry-time
    display none

@keyframes desktop-spin
  to
    transform rotate(360deg)

@media (prefers-reduced-motion: reduce)
  .desktop__spinner
    animation-duration 1.6s
</style>
