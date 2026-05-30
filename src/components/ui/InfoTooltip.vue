<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  useTemplateRef,
} from "vue";

const props = defineProps<{
  ariaLabel?: string;
  content: string;
}>();

const POPUP_WIDTH = 300;
const GAP = 8;
const VIEWPORT_MARGIN = 12;

const triggerRef = useTemplateRef<HTMLButtonElement>("trigger");
const popupRef = useTemplateRef<HTMLDivElement>("popup");
const visible = ref(false);
const coords = ref({ top: 0, left: 0 });
const placement = ref<"above" | "below">("below");
const maxHeightPx = ref(360);

const popupStyle = computed(() => {
  const trigger = triggerRef.value;
  let arrowLeft = "50%";
  if (trigger) {
    const rect = trigger.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const offset = center - coords.value.left;
    arrowLeft = `${Math.max(18, Math.min(POPUP_WIDTH - 18, offset))}px`;
  }
  return {
    top: `${coords.value.top}px`,
    left: `${coords.value.left}px`,
    width: `${POPUP_WIDTH}px`,
    maxHeight: `${maxHeightPx.value}px`,
    "--arrow-left": arrowLeft,
  };
});

let hideTimer: ReturnType<typeof setTimeout> | null = null;

function cancelHide(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function scheduleHide(): void {
  cancelHide();
  hideTimer = setTimeout(() => {
    visible.value = false;
    unbindWindowListeners();
  }, 120);
}

function clampLeft(centerX: number, width: number): number {
  const half = width / 2;
  let left = centerX - half;
  left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN),
  );
  return left;
}

async function updatePosition(): Promise<void> {
  const trigger = triggerRef.value;
  const popup = popupRef.value;
  if (!trigger) return;

  const rect = trigger.getBoundingClientRect();
  const popupW = popup?.offsetWidth || POPUP_WIDTH;
  const popupH = popup?.offsetHeight || 280;
  const centerX = rect.left + rect.width / 2;

  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - VIEWPORT_MARGIN;

  if (spaceBelow >= Math.min(160, popupH) || spaceBelow >= spaceAbove) {
    placement.value = "below";
    maxHeightPx.value = Math.max(120, Math.min(360, spaceBelow - GAP));
    coords.value = {
      top: rect.bottom + GAP,
      left: clampLeft(centerX, popupW),
    };
  } else {
    placement.value = "above";
    maxHeightPx.value = Math.max(120, Math.min(360, spaceAbove - GAP));
    const h = popup?.offsetHeight ?? Math.min(maxHeightPx.value, spaceAbove - GAP);
    coords.value = {
      top: Math.max(VIEWPORT_MARGIN, rect.top - GAP - h),
      left: clampLeft(centerX, popupW),
    };
  }
}

async function show(): Promise<void> {
  visible.value = true;
  await nextTick();
  await updatePosition();
  await nextTick();
  await updatePosition();
}

function hide(): void {
  visible.value = false;
}

function onScrollOrResize(): void {
  if (visible.value) void updatePosition();
}

function bindWindowListeners(): void {
  window.addEventListener("resize", onScrollOrResize);
  window.addEventListener("scroll", onScrollOrResize, true);
}

function unbindWindowListeners(): void {
  window.removeEventListener("resize", onScrollOrResize);
  window.removeEventListener("scroll", onScrollOrResize, true);
}

function onShow(): void {
  cancelHide();
  bindWindowListeners();
  void show();
}

function onHide(): void {
  scheduleHide();
}

onBeforeUnmount(() => {
  unbindWindowListeners();
});
</script>

<template>
  <span class="info-tip">
    <button
      ref="trigger"
      type="button"
      class="info-tip__btn"
      :aria-label="ariaLabel ?? '查看说明'"
      @mouseenter="onShow"
      @mouseleave="onHide"
      @focus="onShow"
      @blur="onHide"
    >
      <svg
        class="info-tip__icon"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" stroke-width="1.25" />
        <circle cx="8" cy="5.35" r="0.9" fill="currentColor" />
        <path
          d="M8 7.25v3.9"
          stroke="currentColor"
          stroke-width="1.35"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </span>

  <Teleport to="body">
    <div
      v-show="visible"
      ref="popup"
      class="info-tip__popup"
      :class="`info-tip__popup--${placement}`"
      :style="popupStyle"
      role="tooltip"
      @mouseenter="cancelHide"
      @mouseleave="onHide"
    >
      {{ props.content }}
    </div>
  </Teleport>
</template>

<style scoped>
.info-tip {
  display: inline-flex;
  vertical-align: middle;
  flex-shrink: 0;
}

.info-tip__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--tp-text-secondary);
  cursor: help;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.info-tip__btn:hover,
.info-tip__btn:focus-visible {
  color: var(--tp-text-accent);
  background: rgba(0, 122, 255, 0.1);
  outline: none;
}

.info-tip__icon {
  display: block;
}
</style>

<style>
/* Teleport 到 body，不能 scoped */
.info-tip__popup {
  position: fixed;
  z-index: 20000;
  box-sizing: border-box;
  padding: 12px 14px;
  border-radius: 10px;
  background: #1d1d1f;
  color: #f5f5f7;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-line;
  text-align: left;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
  pointer-events: auto;
}

.info-tip__popup--below::before,
.info-tip__popup--above::before {
  content: "";
  position: absolute;
  left: var(--arrow-left, 50%);
  transform: translateX(-50%);
  border: 6px solid transparent;
}

.info-tip__popup--below::before {
  bottom: 100%;
  border-bottom-color: #1d1d1f;
}

.info-tip__popup--above::before {
  top: 100%;
  border-top-color: #1d1d1f;
}
</style>
