<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import type { BorderTextEdge, EngraveStyle, TextFacing } from '@shared/types'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'
import { useBorderText } from '@/composables/useBorderText'
import { TRAY_FONT_CATALOG } from '@shared/tray/font-catalog'
import { validateTrayFromAppConfig } from '@shared/utils/tray-validation'
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

const fontOptions = TRAY_FONT_CATALOG.map((f) => ({
  value: f.id,
  label: f.label
}))

const trayError = computed(() => {
  const v = validateTrayFromAppConfig(config.value)
  return v.valid ? null : v.message
})

function edgeAt(index: number): BorderTextEdge | undefined {
  return config.value.tray.borderTextByEdge[index]
}

function patchEdge(index: number, patch: Partial<BorderTextEdge>): void {
  const edge = edgeAt(index)
  if (edge) Object.assign(edge, patch)
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
        <div class="engrave-block">
          <div class="edge-list">
            <div
              v-for="(label, index) in edgeLabels"
              :key="label"
              class="edge-card"
            >
              <div class="edge-card__head">
                <span class="edge-card__title">{{ label }}</span>
                <div class="edge-card__controls">
                  <select
                    class="ctrl ctrl--font"
                    :value="edgeAt(index)?.fontId ?? 'inter'"
                    title="字体"
                    @change="
                      patchEdge(index, {
                        fontId: ($event.target as HTMLSelectElement).value,
                      })
                    "
                  >
                    <option
                      v-for="opt in fontOptions"
                      :key="opt.value"
                      :value="opt.value"
                    >
                      {{ opt.label }}
                    </option>
                  </select>
                  <label class="ctrl ctrl--size" title="字号 (mm)">
                    <span class="ctrl__mini">字号</span>
                    <input
                      type="number"
                      class="ctrl__num"
                      :value="edgeAt(index)?.fontSizeMm ?? 2.2"
                      min="1"
                      max="8"
                      step="0.1"
                      @input="
                        patchEdge(index, {
                          fontSizeMm: Number(
                            ($event.target as HTMLInputElement).value,
                          ),
                        })
                      "
                    />
                  </label>
                  <div
                    class="facing-toggle"
                    role="group"
                    :aria-label="`${label}文字方向`"
                  >
                    <button
                      type="button"
                      class="facing-toggle__btn"
                      :class="{
                        'facing-toggle__btn--active':
                          edgeAt(index)?.facing === 'inward',
                      }"
                      title="朝内"
                      @click="patchEdge(index, { facing: 'inward' })"
                    >
                      内
                    </button>
                    <button
                      type="button"
                      class="facing-toggle__btn"
                      :class="{
                        'facing-toggle__btn--active':
                          (edgeAt(index)?.facing ?? 'outward') === 'outward',
                      }"
                      title="朝外"
                      @click="patchEdge(index, { facing: 'outward' })"
                    >
                      外
                    </button>
                  </div>
                  <label class="ctrl ctrl--offset" title="垂直于边、相对边框带中线的偏移 (mm)">
                    <span class="ctrl__mini">垂直</span>
                    <input
                      type="number"
                      class="ctrl__num ctrl__num--wide"
                      :value="edgeAt(index)?.centerOffsetMm ?? 0"
                      step="0.5"
                      @input="
                        patchEdge(index, {
                          centerOffsetMm: Number(
                            ($event.target as HTMLInputElement).value,
                          ),
                        })
                      "
                    />
                  </label>
                </div>
              </div>
              <input
                type="text"
                class="edge-card__input"
                :value="edgeAt(index)?.content ?? ''"
                placeholder="纪念文字（边框带内垂直居中）"
                @input="
                  patchEdge(index, {
                    content: ($event.target as HTMLInputElement).value,
                  })
                "
              />
            </div>
          </div>
          <SegmentedControl
            v-model="globalEngraveStyle"
            :options="engraveOptions"
          />
        </div>
      </template>

      <p class="hint">仅支持矩形与多边形 · 垂直偏移相对黄框边带中线，正=朝外</p>
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

.engrave-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  width: 100%;
}

.edge-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.edge-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: var(--tp-radius-control);
  background: var(--tp-bg-input);
  min-width: 0;
}

.edge-card__head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.edge-card__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tp-text-primary);
  flex-shrink: 0;
}

.edge-card__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ctrl {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.ctrl--font {
  height: 32px;
  min-width: 0;
  max-width: 96px;
  padding: 0 6px;
  border: none;
  border-radius: 8px;
  background: var(--tp-bg-panel);
  font-size: 12px;
}

.ctrl__mini {
  font-size: 10px;
  color: var(--tp-text-secondary);
  white-space: nowrap;
}

.ctrl__num {
  width: 40px;
  height: 28px;
  padding: 0 4px;
  border: none;
  border-radius: 6px;
  background: var(--tp-bg-panel);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
}

.ctrl__num--wide {
  width: 48px;
}

.facing-toggle {
  display: flex;
  padding: 2px;
  border-radius: 8px;
  background: var(--tp-bg-segment);
  height: 32px;
  box-sizing: border-box;
}

.facing-toggle__btn {
  width: 26px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--tp-text-secondary);
}

.facing-toggle__btn--active {
  background: #fff;
  color: var(--tp-text-primary);
  box-shadow: var(--tp-shadow-segment);
}

.edge-card__input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  height: 40px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: var(--tp-bg-panel);
  font-size: 15px;
  font-weight: 500;
  color: var(--tp-text-primary);
  outline: none;
}

.edge-card__input:focus {
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

.engrave-block :deep(.segmented) {
  width: 100%;
  min-width: 0;
}
</style>
