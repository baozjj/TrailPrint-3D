<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useConfigStore } from "@/stores/config";
import { useUiStore } from "@/stores/ui";
import { validateTrayFromAppConfig } from "@shared/utils/tray-validation";
import AccordionSection from "@/components/ui/AccordionSection.vue";
import NumberField from "@/components/ui/NumberField.vue";
import IosToggle from "@/components/ui/IosToggle.vue";

const configStore = useConfigStore();
const ui = useUiStore();
const { config } = storeToRefs(configStore);
const { openSections } = storeToRefs(ui);

const trayError = computed(() => {
  const v = validateTrayFromAppConfig(config.value);
  return v.valid ? null : v.message;
});
</script>

<template>
  <AccordionSection
    title="4. 托盘底座"
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

    <div class="subsection">
      <div class="toggle-row">
        <div class="toggle-copy">
          <span class="toggle-label">NFC 与 LED 指示</span>
          <span class="toggle-desc">在托盘凹槽顶面预留芯片槽与指示灯位</span>
        </div>
        <IosToggle v-model="config.tray.nfc.enabled" />
      </div>

      <template v-if="config.tray.nfc.enabled">
        <p class="group-title">NFC 芯片槽</p>
        <p class="field-hint">
          在凹槽顶面（与打印轮廓同形、同圆心）铣出浅槽，用于嵌入 NFC 芯片。
        </p>
        <NumberField
          v-model="config.tray.nfc.wallClearanceMm"
          label="距打印内壁"
          suffix="mm"
          :min="0"
          :max="10"
          :step="0.1"
        />
        <p class="field-hint">
          NFC 槽相对打印外轮廓向内缩的距离。例如六边形边长 45mm、填 1mm，则槽边距 45mm 轮廓内壁 1mm。
        </p>
        <NumberField
          v-model="config.tray.nfc.recessDepthMm"
          label="NFC 槽深度"
          suffix="mm"
          :min="0.1"
          :max="5"
          :step="0.1"
        />
        <p class="field-hint">从凹槽顶面向下挖入的深度，用于容纳 NFC 芯片厚度。</p>

        <p class="group-title">LED 指示位</p>
        <p class="field-hint">
          在轨迹起点与终点各铣一个矩形槽，用于安装 0805 贴片 LED（起终点指示）。
        </p>
        <div class="row">
          <NumberField
            v-model="config.tray.nfc.ledPocketLengthMm"
            label="LED 槽长度"
            suffix="mm"
            :min="0.5"
            :max="20"
            :step="0.1"
          />
          <NumberField
            v-model="config.tray.nfc.ledPocketWidthMm"
            label="LED 槽宽度"
            suffix="mm"
            :min="0.5"
            :max="20"
            :step="0.1"
          />
        </div>
        <p class="field-hint">
          矩形槽尺寸（长边沿轨迹方向）。0805 封装约 2.0 × 1.25mm，默认放大以便焊接与透光。
        </p>
        <NumberField
          v-model="config.tray.nfc.ledExtraRecessDepthMm"
          label="LED 额外深度"
          suffix="mm"
          :min="0"
          :max="3"
          :step="0.1"
        />
        <p class="field-hint">
          在 NFC 槽深度之上，LED 位再向下加深，确保灯珠低于顶面、可正常发光。
        </p>

        <p class="group-title">装配盖片</p>
        <p class="field-hint">
          装入 NFC 与 LED 后，将盖片压在凹槽顶面：外轮廓与山体打印区一致，仅轨迹起终点开孔漏光。
        </p>
        <NumberField
          v-model="config.tray.nfc.coverThicknessMm"
          label="盖片厚度"
          suffix="mm"
          :min="0.1"
          :max="3"
          :step="0.05"
        />
        <p class="field-hint">
          导出 ZIP 时附带 Tray_Cover.stl。默认 0.2mm，可按打印机精度微调。
        </p>
        <NumberField
          v-model="config.tray.nfc.coverInsetMm"
          label="盖片内缩"
          suffix="mm"
          :min="0"
          :max="5"
          :step="0.1"
        />
        <p class="field-hint">
          盖片外轮廓相对山体打印区向内缩的距离（同形、同圆心），默认 0.2mm，便于嵌入凹槽顶面。
        </p>
      </template>
    </div>

    <p v-if="trayError" class="error">{{ trayError }}</p>
  </AccordionSection>
</template>

<style scoped>
.subsection {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid var(--tp-border);
}

.toggle-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.toggle-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.toggle-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--tp-text-primary);
}

.toggle-desc {
  font-size: 12px;
  line-height: 1.45;
  color: var(--tp-text-secondary);
}

.group-title {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--tp-text-primary);
}

.field-hint {
  margin: -4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--tp-text-secondary);
}

.row {
  display: flex;
  gap: 12px;
}

.row > * {
  flex: 1;
  min-width: 0;
}

.error {
  margin: 0;
  font-size: 12px;
  color: #ff3b30;
}
</style>
