import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useNotificationStore = defineStore('notification', () => {
  const message = ref('');
  const tone = ref<'success' | 'error' | 'info'>('info');
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function dismiss() {
    clearTimeout(timeout);
    message.value = '';
  }

  function show(text: string, kind: typeof tone.value = 'info', duration = 5000) {
    clearTimeout(timeout);
    message.value = text;
    tone.value = kind;
    if (duration > 0) timeout = setTimeout(dismiss, duration);
  }

  return { message, tone, show, dismiss };
});
