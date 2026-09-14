<template>
  <VoexModal :model-value="store.visible" height="80vh" width="80vw" @close="store.close">
    <FileViewer v-if="store.file" :file="store.file" :options="options" />
  </VoexModal>
</template>

<script setup lang="ts">
import { VoexModal } from '@/plugins/voex-modal';
import { usePreviewerStore } from '@/stores/previewer';
import { FileViewer } from '@file-viewer/vue3';
import officePreset from '@file-viewer/preset-standard';
const options = {
  preset: officePreset,
  rendererMode: 'replace',
  theme: 'light',
  styleIsolation: 'shadow',
  toolbar: { position: 'bottom-right' },
} as const;
const store = usePreviewerStore();
</script>

<style scoped lang="stylus">
:deep(.voex-modal__body)
  padding 0
  height 80vh
</style>
