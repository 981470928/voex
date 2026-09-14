import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { FileInfo } from '@/service/api/document-api';
import { downloadFile } from '@/service/api/upload-api';
export const usePreviewerStore = defineStore('previewer', () => {
  const visible = ref(false);
  const file = ref<File>();

  async function open(fileKey: string, fileData: FileInfo) {
    const blob = await downloadFile(fileKey, fileData.hash);
    if (blob) {
      file.value = new File([blob], fileData.name, { type: fileData.mime });
      visible.value = true;
    }
  }

  function close() {
    visible.value = false;
    file.value = undefined;
  }

  return { visible, file, open, close };
});
