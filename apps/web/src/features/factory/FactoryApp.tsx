import { memo, useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { BenchmarkScreen } from '../benchmark/BenchmarkScreen'
import { initialSortingCode, SortingScreen } from '../sorting/SortingScreen'
import { ManufacturingPrototype } from '../../game/manufacturing/ManufacturingPrototype'
import { getManufacturingDashboard } from '../../factory/manufacturing/engine'
import { usePythonDraft } from '../../factory/python/usePythonDraft'
import { WorldMap } from '../../game/world-map/WorldMap'
import { useFactoryRuntime } from '../../factory/runtime/useFactoryRuntime'
import { FactoryWarehouse } from '../../game/warehouse/FactoryWarehouse'
import { MapPythonEditor } from '../../game/world-map/MapOperations'
import { useWindowLayout } from '../../game/workspace/windowLayout'

const mapPath = `${import.meta.env.BASE_URL}map/`
const manufacturingPath = `${import.meta.env.BASE_URL}prototypes/manufacturing/`
const MapScreen = memo(WorldMap)

function currentScreen(): keyof typeof titles {
  if (window.location.pathname === manufacturingPath) return 'manufacturing'
  const view = new URLSearchParams(window.location.search).get('view')
  return view === 'warehouse' || view === 'benchmark' || view === 'sorting' ? view : 'map'
}

const titles = { manufacturing: '製造ライン', warehouse: '部品倉庫', benchmark: '性能試験', sorting: '仕分け施設', map: '工場拠点マップ' }

export function FactoryApp() {
  const runtime = useFactoryRuntime()
  const workspace = useWindowLayout()
  const [sortingDraft, setSortingDraft] = usePythonDraft('sorting', initialSortingCode)
  const [screen, setScreen] = useState(currentScreen)
  const { line, search, lastDelivery, started } = runtime.line
  const dashboard = screen === 'map' ? getManufacturingDashboard(line) : undefined
  const warehouseEditor = {
    draft: runtime.draft, onChange: runtime.setDraft, onApply: () => runtime.line.applyCode(runtime.draft),
    program: runtime.line.program, report: runtime.line.report, n: search.weights.length,
    target: search.order.requiredWeight, measurements: search.log,
  }

  useEffect(() => {
    const onPopState = () => setScreen(currentScreen())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    document.title = `Brain Forge | ${titles[screen]}`
  }, [screen])

  function navigate(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = event.target
    const link = target instanceof Element ? target.closest('a[href]') : null
    if (!link || link.hasAttribute('download') || (link.getAttribute('target') ?? '_self') !== '_self') return
    const href = link.getAttribute('href')
    if (!href) return
    const url = new URL(href, window.location.href)
    if (url.origin !== window.location.origin || (url.pathname !== mapPath && url.pathname !== manufacturingPath)) return

    event.preventDefault()
    if (url.href === window.location.href) return
    window.history.pushState(null, '', url)
    setScreen(currentScreen())
    window.scrollTo(0, 0)
  }

  return (
    <div onClick={navigate}>
      {screen === 'manufacturing' ? <ManufacturingPrototype runtime={runtime} />
        : screen === 'warehouse' ? <FactoryWarehouse runtime={runtime} />
          : screen === 'benchmark' ? <BenchmarkScreen initialCode={runtime.draft} />
          : screen === 'sorting' ? <SortingScreen code={sortingDraft} onChange={setSortingDraft}
            workspace={workspace} warehouseEditor={<MapPythonEditor data={warehouseEditor} />} />
          : <MapScreen measurementIndex={search.pending?.index ?? null} running={line.running}
            workspace={workspace}
            machineStatus={line.status} progress={line.progress} delivery={lastDelivery}
            started={started} onToggleRunning={runtime.line.toggle} elapsedTicks={line.tick} completed={line.completed} order={search.order}
            editor={warehouseEditor}
            revenue={dashboard?.revenue} revenueRate={dashboard?.revenueRate} windowTicks={dashboard?.windowTicks} />}
    </div>
  )
}
