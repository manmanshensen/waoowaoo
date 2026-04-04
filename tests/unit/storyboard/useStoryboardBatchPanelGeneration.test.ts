import { describe, expect, it } from 'vitest'
import { splitPendingPanelIdsIntoGroups } from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/hooks/useStoryboardBatchPanelGeneration'

describe('splitPendingPanelIdsIntoGroups', () => {
  it('prefers 4 + 1 for five pending panels', () => {
    expect(splitPendingPanelIdsIntoGroups(['p1', 'p2', 'p3', 'p4', 'p5'])).toEqual([
      ['p1', 'p2', 'p3', 'p4'],
      ['p5'],
    ])
  })

  it('prefers 4 + 1 + 1 + 1 for seven pending panels', () => {
    expect(splitPendingPanelIdsIntoGroups(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'])).toEqual([
      ['p1', 'p2', 'p3', 'p4'],
      ['p5'],
      ['p6'],
      ['p7'],
    ])
  })

  it('prefers 9 + 4 + 1 for fourteen pending panels', () => {
    expect(
      splitPendingPanelIdsIntoGroups([
        'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12', 'p13', 'p14',
      ]),
    ).toEqual([
      ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'],
      ['p10', 'p11', 'p12', 'p13'],
      ['p14'],
    ])
  })
})
