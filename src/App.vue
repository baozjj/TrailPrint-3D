<script setup lang="ts">
import ControlSidebar from '@/components/layout/ControlSidebar.vue'
import PreviewPanel from '@/components/layout/PreviewPanel.vue'
</script>

<template>
  <div class="workspace">
    <ControlSidebar />
    <PreviewPanel />
  </div>
</template>

<style scoped>
.workspace {
  flex: 1 1 auto;
  display: flex;
  gap: 20px;
  min-height: 0;
  overflow: hidden;
  padding: 24px;
  background: var(--tp-bg-page);
}
</style>
