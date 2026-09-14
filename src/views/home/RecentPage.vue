<template>
  <main class="recent-page">1</main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useImages } from '@/composables/useImages';

const { getImages } = useImages('/');
</script>

<style scoped lang="stylus">
.recent-page
  position relative
</style>
