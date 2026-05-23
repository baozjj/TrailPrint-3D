<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import type { EngraveStyle } from '@shared/types'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'
import { useBorderText } from '@/composables/useBorderText'
import AccordionSection from '@/components/ui/AccordionSection.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import IosToggle from '@/components/ui/IosToggle.vue'
import NumberField from '@/components/ui/NumberField.vue'

const configStore = useConfigStore()
const ui = useUiStore()
const { config } = storeToRefs(configStore)
const { openSections, borderTextEnabled, globalEngraveStyle } = storeToRefs(ui)
const { supportsBorderText, edgeLabels } = useBorderText()

const engraveOptions: { value: EngraveStyle; label: string }[] = [
  { value: 'intaglio', label: '阴刻(凹)' },
  { value: 'relief', label: '阳刻(凸)' }
]

const trayError = computed(() => {
  if (config.value.tray.recessDepthMm >= config.value.tray.totalThicknessMm) {
    return '下陷深度必须小于总厚度'
  }
  return null
})

function edgeContent(index: number): string {
  return config.value.tray.borderTextByEdge[index]?.content ?? ''
}
</script>

<template>
  <AccordionSection
    title="4. 托盘底座与刻字"
    :open="openSections.tray"
    @toggle="ui.toggleSection('tray')"
  >
    <NumberField
      v-model="config.tray.totalThicknessMm"
      label="总厚度"
      suffix="mm"
      :min="1"
      :max="50"
      :step="0.5"
    />
    <NumberField
      v-model="config.tray.recessDepthMm"
      label="下陷深度"
      suffix="mm"
      :min="0"
      :max="49"
      :step="0.5"
    />
    <NumberField
      v-model="config.tray.rimWidthMm"
      label="边框宽度"
      suffix="mm"
      :min="1"
      :max="30"
      :step="0.5"
    />
    <p v-if="trayError" class="error">{{ trayError }}</p>

    <template v-if="supportsBorderText">
      <div class="toggle-row">
        <span>启用边框刻字</span>
        <IosToggle v-model="borderTextEnabled" />
      </div>

      <template v-if="borderTextEnabled">
        <div class="edge-grid">
          <label v-for="(label, index) in edgeLabels" :key="label" class="text-edge">
            <span class="text-edge__label">{{ label }}</span>
            <input
              type="text"
              class="text-edge__input"
              :value="edgeContent(index)"
              placeholder="纪念文字"
              @input="
                (e) => {
                  const edge = config.tray.borderTextByEdge[index]
                  if (edge) edge.content = (e.target as HTMLInputElement).value
                }
              "
            />
          </label>
        </div>
        <SegmentedControl v-model="globalEngraveStyle" :options="engraveOptions" />
      </template>

      <p class="hint">仅支持矩形与多边形</p>
    </template>
  </AccordionSection>
</template>

<style scoped>
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
}

.edge-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.text-edge {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.text-edge__label {
  font-size: 12px;
  color: var(--tp-text-secondary);
}

.text-edge__input {
  height: 40px;
  padding: 0 12px;
  border: none;
  border-radius: var(--tp-radius-control);
  background: var(--tp-bg-input);
  font-size: 15px;
  font-weight: 500;
  color: var(--tp-text-primary);
  outline: none;
}

.text-edge__input:focus {
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.25);
}

.hint {
  margin: 0;
  font-size: 11px;
  color: var(--tp-text-secondary);
}

.error {
  margin: 0;
  font-size: 12px;
  color: #ff3b30;
}
</style>
