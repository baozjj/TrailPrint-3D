<script setup lang="ts">
import { computed } from 'vue'
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

/** 兼容旧版 assembly.trailProtrusionMm */
const trailHeightAboveMain = computed({
  get: () => {
    const t = config.value.trail
    if (t.heightAboveMainMm != null) return t.heightAboveMainMm
    const legacy = (config.value.assembly as { trailProtrusionMm?: number })
      .trailProtrusionMm
    return legacy ?? 0.12
  },
  set: (v: number) => {
    config.value.trail.heightAboveMainMm = v
  },
})
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
    <NumberField
      v-model="trailHeightAboveMain"
      label="高出主模型"
      suffix="mm"
      :min="0"
      :max="3"
      :step="0.01"
    />
    <p class="hint">
      导出轨迹件时，顶面在主模型对应地表高度上再抬高此值，便于嵌入后略露出。
    </p>
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
.hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-text-secondary, #888);
}
</style>
