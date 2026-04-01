'use client'

/**
 * RatioSelector / StyleSelector - 公共选择器组件
 * 卡片边框风格：选中时蓝色描边 + 淡色背景 + 加粗文字
 *
 * 使用场景：首页、项目故事输入页
 */
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/ui/icons'

const VIEWPORT_EDGE_GAP = 8

/** 线框比例预览块 */
function RatioShape({ ratio, selected, size = 26 }: { ratio: string; selected: boolean; size?: number }) {
  const [w, h] = ratio.split(':').map(Number)
  const max = Math.max(w, h)
  return (
    <div
      className={`rounded-md border-2 transition-colors ${
        selected ? 'border-[var(--glass-accent-from)]' : 'border-[var(--glass-stroke-strong)]'
      }`}
      style={{
        width: Math.min(size, size * (w / max)),
        height: Math.min(size, size * (h / max)),
      }}
    />
  )
}

export function RatioSelector({
  value,
  onChange,
  options,
  getUsage,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; recommended?: boolean }[]
  getUsage?: (ratio: string) => string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const panelWidth = Math.max(300, rect.width)
    const left = Math.min(
      Math.max(VIEWPORT_EDGE_GAP, rect.left),
      viewportWidth - panelWidth - VIEWPORT_EDGE_GAP
    )
    const maxHeight = Math.max(180, Math.min(320, viewportHeight - rect.bottom - VIEWPORT_EDGE_GAP - 4))

    setPanelStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left,
      width: panelWidth,
      maxHeight,
    })
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      if (dropdownRef.current && !dropdownRef.current.contains(target)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) return
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, updatePosition])

  const selectedOption = options.find((o) => o.value === value)

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="glass-input-base h-11 px-3 flex w-full items-center justify-between gap-2 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <RatioShape ratio={value} size={18} selected />
          <span className="text-sm text-[var(--glass-text-primary)] font-medium">{selectedOption?.label || value}</span>
        </div>
        <AppIcon name="chevronDown" className={`w-4 h-4 text-[var(--glass-text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            className="glass-surface-modal z-[9999] p-3 overflow-y-auto custom-scrollbar"
            style={panelStyle}
          >
            <div className="grid grid-cols-5 gap-2">
              {options.map((option) => {
                const isSelected = value === option.value
                const usageTag = getUsage?.(option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value)
                      setIsOpen(false)
                    }}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-[var(--glass-accent-from)] bg-[var(--glass-accent-from)]/5 shadow-sm'
                        : 'border-[var(--glass-stroke-soft)] hover:border-[var(--glass-stroke-strong)]'
                    }`}
                    title={usageTag || undefined}
                  >
                    <RatioShape ratio={option.value} size={28} selected={isSelected} />
                    <span className={`text-xs ${isSelected ? 'font-semibold text-[var(--glass-accent-from)]' : 'text-[var(--glass-text-secondary)]'}`}>
                      {option.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

export function StyleSelector({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; recommended?: boolean }[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const panelWidth = Math.max(320, rect.width * 2)
    const left = Math.min(
      Math.max(VIEWPORT_EDGE_GAP, rect.left),
      viewportWidth - panelWidth - VIEWPORT_EDGE_GAP
    )
    const maxHeight = Math.max(160, Math.min(320, viewportHeight - rect.bottom - VIEWPORT_EDGE_GAP - 4))

    setPanelStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left,
      width: panelWidth,
      maxHeight,
    })
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      if (dropdownRef.current && !dropdownRef.current.contains(target)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) return
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, updatePosition])

  const selectedOption = options.find((o) => o.value === value) || options[0]

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="glass-input-base h-11 px-3 flex w-full items-center justify-between gap-2 cursor-pointer transition-colors"
      >
        <span className="text-sm text-[var(--glass-text-primary)] font-medium">{selectedOption.label}</span>
        <AppIcon name="chevronDown" className={`w-4 h-4 text-[var(--glass-text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            className="glass-surface-modal z-[9999] p-3 overflow-y-auto custom-scrollbar"
            style={panelStyle}
          >
            <div className="grid grid-cols-2 gap-2">
              {options.map((option) => {
                const isSelected = value === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value)
                      setIsOpen(false)
                    }}
                    className={`flex items-center p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-[var(--glass-accent-from)] bg-[var(--glass-accent-from)]/5 shadow-sm'
                        : 'border-[var(--glass-stroke-soft)] hover:border-[var(--glass-stroke-strong)]'
                    }`}
                  >
                    <span className={`text-sm whitespace-nowrap ${isSelected ? 'font-semibold text-[var(--glass-accent-from)]' : 'text-[var(--glass-text-secondary)]'}`}>
                      {option.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
