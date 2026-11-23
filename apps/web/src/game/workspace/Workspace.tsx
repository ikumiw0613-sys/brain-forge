import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { fitWindow, resizeWindow, windowIds, windowRect, workspaceWindows } from './windowLayout'
import type { Bounds, ResizeDirection, WindowId, WindowRect, WorkspaceLayout } from './windowLayout'
import './workspace.css'

const desktopQuery = '(min-width: 961px)'
const subscribeToDesktop = (update: () => void) => {
  const media = window.matchMedia?.(desktopQuery)
  media?.addEventListener('change', update)
  return () => media?.removeEventListener('change', update)
}
const isDesktop = () => window.matchMedia?.(desktopQuery).matches ?? true
const frameId = (id: WindowId) => `workspace-${id}`

export function Workspace({ layout: { windows, dispatch, tab, setTab }, panels, titleActions }: {
  layout: WorkspaceLayout
  panels: Record<WindowId, ReactNode>
  titleActions?: Partial<Record<WindowId, ReactNode>>
}) {
  const desktop = useSyncExternalStore(subscribeToDesktop, isDesktop)
  const surface = useRef<HTMLDivElement>(null)
  const toolbar = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState<Bounds>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const layer = surface.current
    if (!desktop || !layer) return
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = layer
      setBounds(current => current.width === width && current.height === height ? current : { width, height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(layer)
    return () => observer.disconnect()
  }, [desktop])

  return (
    <section className="workspace-windows" data-desktop={desktop} aria-label="工場の操作ウィンドウ">
      <div ref={toolbar} className="workspace-toolbar" role="group" aria-label="ウィンドウを表示">
        {windowIds.map(id => (
          <button key={id} data-window-button={id} type="button" aria-controls={frameId(id)}
            aria-expanded={desktop ? windows[id].isOpen : tab === id}
            onClick={() => desktop ? dispatch({ type: 'open', id }) : setTab(current => current === id ? null : id)}>
            {workspaceWindows[id]}
          </button>
        ))}
      </div>
      <div className="workspace-surface" ref={surface}>
        {windowIds.map(id => {
          const item = windows[id]
          const rect = windowRect(id, item, bounds)
          return <WindowFrame key={id} id={id} desktop={desktop} rect={rect} bounds={bounds}
            titleActions={titleActions?.[id]}
            open={desktop ? item.isOpen : tab === id}
            maximized={desktop && item.isMaximized} zIndex={item.zIndex}
            onRaise={() => dispatch({ type: 'raise', id })}
            onClose={() => {
              if (desktop) dispatch({ type: 'close', id })
              else setTab(null)
              toolbar.current?.querySelector<HTMLButtonElement>(`[data-window-button=${id}]`)?.focus()
            }}
            onMaximize={() => dispatch({ type: 'maximize', id, restoreRect: rect })}
            onRect={rect => dispatch({ type: 'rect', id, rect })}>
            {panels[id]}
          </WindowFrame>
        })}
      </div>
    </section>
  )
}

type Gesture = { target: HTMLElement; pointer: number; x: number; y: number; rect: WindowRect }
type Mode = 'move' | ResizeDirection
const resizeHandles = [
  ['n', '上端'], ['ne', '右上'], ['e', '右端'], ['se', '右下'],
  ['s', '下端'], ['sw', '左下'], ['w', '左端'], ['nw', '左上'],
] as const

function resizeOffset(position: number, start: number, viewportSize: number) {
  // The pointer is a few pixels inside the frame when it grabs a handle.
  if (position <= 0) return -viewportSize
  if (position >= viewportSize - 1) return viewportSize
  return position - start
}

function WindowFrame({ id, desktop, open, maximized, zIndex, rect, bounds, titleActions, onRaise, onClose, onMaximize, onRect, children }: {
  id: WindowId; desktop: boolean; open: boolean; maximized: boolean; zIndex: number; rect: WindowRect; bounds: Bounds
  onRaise: () => void; onClose: () => void; onMaximize: () => void; onRect: (rect: WindowRect) => void; children: ReactNode
  titleActions?: ReactNode
}) {
  const gesture = useRef<Gesture | null>(null)
  const title = workspaceWindows[id]

  useLayoutEffect(() => {
    if (desktop && open && !maximized) return
    const active = gesture.current
    if (active?.target.hasPointerCapture(active.pointer)) active.target.releasePointerCapture(active.pointer)
    gesture.current = null
  }, [desktop, open, maximized])

  function change(mode: Mode, start: WindowRect, dx: number, dy: number) {
    onRect(mode === 'move' ? fitWindow({ ...start, x: start.x + dx, y: start.y + dy }, bounds)
      : resizeWindow(start, mode, dx, dy, bounds))
  }

  function handle(mode: Mode) {
    return {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (maximized || event.button !== 0 || gesture.current) return
        gesture.current = { target: event.currentTarget, pointer: event.pointerId, x: event.clientX, y: event.clientY, rect }
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const active = gesture.current
        if (!active || active.pointer !== event.pointerId) return
        const dx = mode === 'move' ? event.clientX - active.x : resizeOffset(event.clientX, active.x, bounds.width)
        const dy = mode === 'move' ? event.clientY - active.y : resizeOffset(event.clientY, active.y, bounds.height)
        change(mode, active.rect, dx, dy)
      },
      onLostPointerCapture(event: PointerEvent<HTMLButtonElement>) {
        if (gesture.current?.pointer === event.pointerId) gesture.current = null
      },
      onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        const delta = {
          ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
        }[event.key]
        if (!delta || maximized) return
        event.preventDefault()
        const step = event.shiftKey ? 48 : 16
        change(mode, rect, delta[0] * step, delta[1] * step)
      },
    }
  }

  return (
    <section id={frameId(id)} className="workspace-window" aria-labelledby={`${frameId(id)}-title`}
      data-window={id} data-maximized={maximized} hidden={!open}
      style={desktop && bounds.width ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex } : { zIndex }}
      onPointerDown={desktop ? onRaise : undefined}
      onFocus={desktop ? onRaise : undefined}
      onKeyDown={event => {
        if (maximized && event.key === 'Escape' && !event.defaultPrevented) onMaximize()
      }}>
      <div className="workspace-titlebar">
        <h2 id={`${frameId(id)}-title`}>
          {desktop && !maximized ? <button className="workspace-move" type="button"
            aria-label={`${title}を移動（矢印キー）`} {...handle('move')}>{title}</button> : title}
        </h2>
        {titleActions}
        {desktop && <button type="button" aria-label={`${title}を${maximized ? '復元' : '最大化'}`}
          onClick={onMaximize}>{maximized ? '復元' : '最大化'}</button>}
        <button type="button" aria-label={`${title}を閉じる`} onClick={onClose}>閉じる</button>
      </div>
      <div className="workspace-content" tabIndex={id === 'python' ? undefined : 0}>{children}</div>
      {desktop && !maximized && resizeHandles.map(([direction, label]) => (
        <button key={direction} className="workspace-resize" data-direction={direction} type="button"
          aria-label={`${title}の${label}でサイズを変更（矢印キー）`} {...handle(direction)} />
      ))}
    </section>
  )
}
