import type { AssistantId, AssistantSkillDefinition } from './types'
import { apiConfigTemplateSkill } from './skills/api-config-template'
import { sd2PeSkill } from './skills/sd2-pe'
import { tutorialSkill } from './skills/tutorial'

const SKILLS: Record<AssistantId, AssistantSkillDefinition> = {
  'api-config-template': apiConfigTemplateSkill,
  'sd2-pe': sd2PeSkill,
  tutorial: tutorialSkill,
}

export function getAssistantSkill(id: AssistantId): AssistantSkillDefinition {
  return SKILLS[id]
}

export function isAssistantId(value: unknown): value is AssistantId {
  return value === 'api-config-template' || value === 'tutorial' || value === 'sd2-pe'
}
