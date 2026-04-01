import { describe, expect, it } from 'vitest'
import { calcImage } from '@/lib/billing/cost'
import { findBuiltinCapabilities } from '@/lib/model-capabilities/catalog'
import { findBuiltinPricingCatalogEntry } from '@/lib/model-pricing/catalog'

describe('grsai image builtin catalogs', () => {
  it('registers resolution capabilities for grsai nano banana models', () => {
    expect(findBuiltinCapabilities('image', 'grsai', 'nano-banana-2')?.image?.resolutionOptions).toEqual([
      '1K',
      '2K',
      '4K',
    ])
    expect(findBuiltinCapabilities('image', 'grsai', 'nano-banana-pro-vip')?.image?.resolutionOptions).toEqual([
      '1K',
      '2K',
    ])
  })

  it('registers builtin pricing tiers for grsai models', () => {
    expect(findBuiltinPricingCatalogEntry('image', 'grsai', 'nano-banana-fast')?.pricing).toEqual({
      mode: 'flat',
      flatAmount: 0.576,
    })
    expect(findBuiltinPricingCatalogEntry('image', 'grsai', 'nano-banana-2')?.pricing.mode).toBe('capability')
  })

  it('calculates grsai image costs from builtin pricing', () => {
    const banana2Cost = calcImage('grsai::nano-banana-2', 2, {
      resolution: '4K',
    })
    const vip4kCost = calcImage('grsai::nano-banana-pro-4k-vip', 1)

    expect(banana2Cost).toBeCloseTo(2.304, 8)
    expect(vip4kCost).toBeCloseTo(1.728, 8)
  })
})
