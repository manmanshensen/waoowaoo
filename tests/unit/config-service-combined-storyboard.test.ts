import { describe, expect, it } from 'vitest'
import { getCombinedStoryboardConfigForPanelCount } from '@/lib/config-service'

describe('getCombinedStoryboardConfigForPanelCount', () => {
  const baseConfig = {
    storyboardModel: 'storyboard-model',
    combinedStoryboardModel: 'combined-model',
    combinedStoryboardResolution: '4K',
    combinedStoryboard1x1Model: null,
    combinedStoryboard2x2Model: null,
    combinedStoryboard3x3Model: null,
    combinedStoryboard1x1Resolution: null,
    combinedStoryboard2x2Resolution: null,
    combinedStoryboard3x3Resolution: null,
  }

  it('uses 1K for 1x1 by default', () => {
    expect(getCombinedStoryboardConfigForPanelCount(baseConfig, 1)).toEqual({
      layoutKey: '1x1',
      model: 'combined-model',
      resolution: '1K',
    })
  })

  it('uses 2K for 2x2 by default', () => {
    expect(getCombinedStoryboardConfigForPanelCount(baseConfig, 4)).toEqual({
      layoutKey: '2x2',
      model: 'combined-model',
      resolution: '2K',
    })
  })

  it('uses 4K for 3x3 by default', () => {
    expect(getCombinedStoryboardConfigForPanelCount(baseConfig, 9)).toEqual({
      layoutKey: '3x3',
      model: 'combined-model',
      resolution: '4K',
    })
  })
})
