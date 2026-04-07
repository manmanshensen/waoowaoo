import type { AssistantRuntimeContext, AssistantSkillDefinition } from '../types'
import { renderAssistantSystemPrompt } from '../system-prompts'

function buildSd2PePrompt(ctx: AssistantRuntimeContext): string {
  return renderAssistantSystemPrompt('sd2-pe', {
    panelContextJson: ctx.context.panelContextJson?.trim() || '（未提供 panel 上下文）',
  })
}

export const sd2PeSkill: AssistantSkillDefinition = {
  id: 'sd2-pe',
  systemPrompt: buildSd2PePrompt,
  temperature: 0.2,
  maxSteps: 4,
}
