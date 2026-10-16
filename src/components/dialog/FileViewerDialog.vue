<template>
  <VoexModal :model-value="true" height="80vh" width="80vw" @close="emit('close')">
    <FileViewer :file="file" :options="options" />
  </VoexModal>
</template>

<script setup lang="ts">
import { VoexModal } from '@/plugins/voex-modal';
import { FileViewer } from '@file-viewer/vue3';
import officePreset from '@file-viewer/preset-standard';
const options = {
  preset: officePreset,
  rendererMode: 'replace',
  theme: 'light',
  styleIsolation: 'shadow',
  toolbar: { position: 'bottom-right' },
} as const;
defineProps<{ file: File }>();
const emit = defineEmits<{ close: [] }>();
</script>

<style scoped lang="stylus">
:deep(.voex-modal__body)
  padding 0
  height 80vh
</style>
