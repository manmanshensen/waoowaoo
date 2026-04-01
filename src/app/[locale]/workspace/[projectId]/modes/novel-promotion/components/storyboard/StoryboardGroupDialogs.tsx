'use client'

import InsertPanelModal from './InsertPanelModal'
import PanelVariantModal from './PanelVariantModal'
import type { VariantData, VariantOptions } from './hooks/usePanelVariant'

interface PanelRuntimeSnapshot {
  id: string
  panelNumber: number | null
  description: string | null
  imageUrl: string | null
}

interface VariantPanelRuntimeSnapshot extends PanelRuntimeSnapshot {
  storyboardId: string
}

interface StoryboardGroupDialogsProps {
  insertAfterPanel: PanelRuntimeSnapshot | null
  nextPanelForInsert: PanelRuntimeSnapshot | null
  insertModalOpen: boolean
  aiInsertingAfterPanelId: string | null
  manualInsertingAfterPanelId: string | null
  insertingAfterPanelId: string | null
  onCloseInsertModal: () => void
  onAiInsert: (userInput: string) => Promise<void>
  onManualInsert: (userInput: string) => Promise<void>
  variantModalPanel: VariantPanelRuntimeSnapshot | null
  projectId: string
  submittingVariantPanelId: string | null
  onCloseVariantModal: () => void
  onVariant: (variant: VariantData, options: VariantOptions) => Promise<void>
}

export default function StoryboardGroupDialogs({
  insertAfterPanel,
  nextPanelForInsert,
  insertModalOpen,
  aiInsertingAfterPanelId,
  manualInsertingAfterPanelId,
  insertingAfterPanelId,
  onCloseInsertModal,
  onAiInsert,
  onManualInsert,
  variantModalPanel,
  projectId,
  submittingVariantPanelId,
  onCloseVariantModal,
  onVariant,
}: StoryboardGroupDialogsProps) {
  return (
    <>
      {insertAfterPanel && (
        <InsertPanelModal
          isOpen={insertModalOpen}
          onClose={onCloseInsertModal}
          prevPanel={insertAfterPanel}
          nextPanel={nextPanelForInsert}
          onAiInsert={onAiInsert}
          onManualInsert={onManualInsert}
          isAiInserting={aiInsertingAfterPanelId === insertAfterPanel.id}
          isManualInserting={manualInsertingAfterPanelId === insertAfterPanel.id}
          isInserting={insertingAfterPanelId === insertAfterPanel.id}
        />
      )}

      {variantModalPanel && (
        <PanelVariantModal
          isOpen={!!variantModalPanel}
          onClose={onCloseVariantModal}
          panel={variantModalPanel}
          projectId={projectId}
          onVariant={onVariant}
          isSubmittingVariantTask={submittingVariantPanelId === variantModalPanel.id}
        />
      )}
    </>
  )
}
