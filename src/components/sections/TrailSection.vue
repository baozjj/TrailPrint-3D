<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'
import AccordionSection from '@/components/ui/AccordionSection.vue'
import IosToggle from '@/components/ui/IosToggle.vue'
import NumberField from '@/components/ui/NumberField.vue'

const configStore = useConfigStore()
const ui = useUiStore()
const { config } = storeToRefs(configStore)
const { openSections } = storeToRefs(ui)
</script>

<template>
  <AccordionSection
    title="3. 轨迹设置"
    :open="openSections.trail"
    @toggle="ui.toggleSection('trail')"
  >
    <div class="toggle-row">
      <span>过滤噪点，平滑轨迹</span>
      <IosToggle v-model="config.trail.gpxSimplify" />
    </div>
    <div class="row">
      <NumberField
        v-model="config.trail.trailWidthMm"
        label="轨迹宽度"
        suffix="mm"
        :min="0.5"
         :max="20"
        :step="0.1"
      />
      <NumberField
        v-model="config.trail.trailDepthMm"
        label="轨迹深度"
        suffix="mm"
        :min="0.1"
        :max="10"
        :step="0.1"
      />
    </div>
  </AccordionSection>
</template>

<style scoped>
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
}

.row {
  display: flex;
  gap: 12px;
}
</style>
