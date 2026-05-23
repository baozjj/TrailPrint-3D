import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { EngraveStyle } from '@shared/types'

export type PreviewMode = '2d' | '3d'

export const useUiStore = defineStore('ui', () => {
  const previewMode = ref<PreviewMode>('2d')
  const openSections = ref<Record<string, boolean>>({
    map: true,
    terrain: true,
    trail: true,
    tray: true,
    assembly: false
  })
  const borderTextEnabled = ref(false)
  const globalEngraveStyle = ref<EngraveStyle>('intaglio')
  const generating = ref(false)
  const statusMessage = ref<string | null>(null)

  function toggleSection(key: string): void {
    openSections.value[key] = !openSections.value[key]
  }

  return {
    previewMode,
    openSections,
    borderTextEnabled,
    globalEngraveStyle,
    generating,
    statusMessage,
    toggleSection
  }
})
