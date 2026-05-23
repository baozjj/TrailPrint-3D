import { computed, watch } from 'vue'
import type { BaseShape, BorderTextEdge, EngraveStyle } from '@shared/types'
import { useConfigStore } from '@/stores/config'
import { useUiStore } from '@/stores/ui'

const RECT_LABELS = ['上', '下', '左', '右'] as const

function makeEdge(label: string, style: EngraveStyle): BorderTextEdge {
  return {
    content: '',
    align: 'center',
    style,
    fontId: 'inter'
  }
}

export function useBorderText() {
  const configStore = useConfigStore()
  const ui = useUiStore()

  const shape = computed(() => configStore.config.mapCrop.shape)
  const supportsBorderText = computed(
    () => shape.value === 'rectangle' || shape.value === 'polygon'
  )

  const edgeLabels = computed(() => {
    if (shape.value === 'rectangle') return [...RECT_LABELS]
    const n = configStore.config.mapCrop.polygonSides
    return Array.from({ length: n }, (_, i) => `边 ${i + 1}`)
  })

  function syncEdges(): void {
    if (!ui.borderTextEnabled || !supportsBorderText.value) {
      configStore.config.tray.borderTextByEdge = []
      return
    }
    const style = ui.globalEngraveStyle
    const existing = configStore.config.tray.borderTextByEdge
    configStore.config.tray.borderTextByEdge = edgeLabels.value.map((label, i) => {
      const prev = existing[i]
      return prev
        ? { ...prev, style }
        : makeEdge(label, style)
    })
  }

  watch([() => ui.borderTextEnabled, shape, edgeLabels], syncEdges, { immediate: true })

  watch(
    () => ui.globalEngraveStyle,
    (style) => {
      configStore.config.tray.borderTextByEdge.forEach((e) => {
        e.style = style
      })
    }
  )

  watch(shape, () => {
    if (shape.value === 'circle') {
      ui.borderTextEnabled = false
    }
  })

  function updateEdgeContent(index: number, content: string): void {
    const edge = configStore.config.tray.borderTextByEdge[index]
    if (edge) edge.content = content
  }

  return {
    supportsBorderText,
    edgeLabels,
    updateEdgeContent,
    syncEdges
  }
}
