import { describe, expect, it } from 'vitest'
import { renderAssistantSystemPrompt } from '@/lib/assistant-platform/system-prompts'

describe('assistant-platform system prompts', () => {
  it('loads api-config-template prompt from lib/prompts/skills and injects providerId', () => {
    const prompt = renderAssistantSystemPrompt('api-config-template', {
      providerId: 'openai-compatible:oa-1',
    })

    expect(prompt).toContain('你是 API 配置助手')
    expect(prompt).toContain('当前 providerId=openai-compatible:oa-1')
    expect(prompt).not.toContain('{{providerId}}')
  })

  it('loads tutorial prompt from lib/prompts/skills', () => {
    const prompt = renderAssistantSystemPrompt('tutorial')

    expect(prompt).toContain('你是产品教程助手')
    expect(prompt).toContain('禁止编造不存在的页面')
  })

  it('loads sd2-pe prompt and injects panel json context', () => {
    const prompt = renderAssistantSystemPrompt('sd2-pe', {
      panelContextJson: '{"panelId":"panel-1"}',
    })

    expect(prompt).toContain('你是 Seedance 2.0 提示词工程专家')
    expect(prompt).toContain('{"panelId":"panel-1"}')
    expect(prompt).not.toContain('{{panelContextJson}}')
  })
})
