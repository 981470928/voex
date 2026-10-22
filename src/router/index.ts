import { watch } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import {
  authenticated,
  accessExpiresAt,
  authUser,
  sessionExpired,
  sessionInitialized,
} from '@/service/auth-session';
import { refreshSession } from '@/service/api/https';
import { readSavedUpgradeWatch, UPGRADE_WATCH_STORAGE_KEY } from '@/service/api/system-api';
import { safeReturnPath } from '@/utils/auth';

const base = import.meta.env.BASE_URL;

// Clear recovery credentials even when an account is changed outside the system page.
watch(
  () => authUser.value?.id,
  (id, previousID) => {
    const saved = readSavedUpgradeWatch();
    if (saved && ((previousID && id !== previousID) || (id && saved.accountID !== id))) {
      try {
        sessionStorage.removeItem(UPGRADE_WATCH_STORAGE_KEY);
      } catch {
        /* Storage may be disabled. */
      }
    }
  },
  { flush: 'sync' }
);

const router = createRouter({
  history: createWebHistory(base),
  routes: [
    {
      path: '/login',
      name: 'login',
      meta: { anonymous: true },
      component: () => import('@/views/auth/LoginPage.vue'),
    },
    {
      path: '/register',
      name: 'register',
      meta: { anonymous: true },
      component: () => import('@/views/auth/RegisterPage.vue'),
    },
    { path: '/join', name: 'join', component: () => import('@/views/team/JoinTeamPage.vue') },
    {
      path: '/share',
      name: 'share',
      meta: { public: true },
      component: () => import('@/views/share/SharedFilePage.vue'),
    },
    {
      path: '/',
      redirect: '/home/recent',
    },
    {
      path: '/home',
      name: 'home',
      component: () => import('@/views/home/Home.vue'),
      children: [
        {
          path: '',
          redirect: { name: 'recent' },
        },
        {
          path: 'profile',
          name: 'profile',
          component: () => import('@/views/auth/ProfilePage.vue'),
        },
        { path: 'teams', name: 'teams', component: () => import('@/views/team/TeamPage.vue') },
        { path: 'trash', name: 'trash', component: () => import('@/views/home/TrashPage.vue') },
        {
          path: 'system',
          name: 'system',
          component: () => import('@/views/system/SystemUpgradePage.vue'),
        },
        {
          path: 'project/:projectId/:folderId?',
          name: 'project',
          component: () => import('@/views/home/ProjectPage.vue'),
        },
        {
          path: 'recent',
          name: 'recent',
          component: () => import('@/views/home/RecentPage.vue'),
        },
      ],
    },
    {
      path: '/recent/:file_key',
      name: 'recent-file',
      component: () => import('@/views/share/SharedFilePage.vue'),
    },
    {
      path: '/edit/:file_key',
      name: 'edit',
      component: () => import('@/views/edit/EditPage.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/home/recent' },
  ],
});

router.beforeEach(async (to, from) => {
  // A job-scoped credential only opens its read-only recovery page during maintenance.
  // Normal session restoration still protects every other route and all mutation APIs.
  const recovery = to.name === 'system' ? readSavedUpgradeWatch() : null;
  if (recovery && (!authUser.value || recovery.accountID === authUser.value.id)) return true;
  if (to.meta.public) return true;
  if (
    to.meta.anonymous &&
    from.meta.anonymous &&
    from.hash &&
    !to.hash &&
    to.query.return === '/join'
  ) {
    return { path: to.path, query: to.query, hash: from.hash, replace: true };
  }
  // Invitation credentials stay in URL fragments throughout authentication.
  if (to.name === 'join' && !to.hash && from.meta.anonymous && from.hash) {
    return { name: 'join', hash: from.hash, replace: true };
  }
  if (
    !sessionInitialized.value ||
    (authenticated.value && accessExpiresAt.value < Date.now() + 30000)
  ) {
    try {
      await refreshSession();
    } catch {
      /* The login form remains available while offline. */
    }
  }
  if (to.meta.anonymous) {
    if (!authenticated.value) return true;
    const destination = safeReturnPath(to.query.return);
    return destination === '/join' && to.hash ? { path: destination, hash: to.hash } : destination;
  }
  if (authenticated.value) return true;
  // Re-authenticate over the existing screen so unsaved document contents stay mounted.
  if (authUser.value && sessionExpired.value) return false;
  return {
    name: 'login',
    query: { return: to.name === 'join' ? '/join' : to.fullPath },
    hash: to.name === 'join' ? to.hash : undefined,
    replace: true,
  };
});

export default router;
