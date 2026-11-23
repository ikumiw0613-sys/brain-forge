import { memo, useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { ManufacturingPrototype } from '../manufacturing/ManufacturingPrototype'
import { getManufacturingDashboard } from '../manufacturing/engine'
import { WorldMap } from '../world-map/WorldMap'
import { useFactoryRuntime } from './useFactoryRuntime'
import { FactoryWarehouse } from './FactoryWarehouse'

const mapPath = `${import.meta.env.BASE_URL}map/`
const manufacturingPath = `${import.meta.env.BASE_URL}prototypes/manufacturing/`
const MapScreen = memo(WorldMap)

function currentScreen(): 'manufacturing' | 'warehouse' | 'map' {
  if (window.location.pathname === manufacturingPath) return 'manufacturing'
  return new URLSearchParams(window.location.search).get('view') === 'warehouse' ? 'warehouse' : 'map'
}

const titles = { manufacturing: '製造ライン', warehouse: '部品倉庫', map: '工場拠点マップ' }

export function FactoryApp() {
  const runtime = useFactoryRuntime()
  const [screen, setScreen] = useState(currentScreen)
  const { line, search, lastDelivery } = runtime.line

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
    window.history.pushState(null, '', url)
    setScreen(currentScreen())
    window.scrollTo(0, 0)
  }

  return (
    <div onClick={navigate}>
      {screen === 'manufacturing' ? <ManufacturingPrototype runtime={runtime} />
        : screen === 'warehouse' ? <FactoryWarehouse runtime={runtime} />
          : <MapScreen measuring={search.pending !== null} running={line.running}
            machineStatus={line.status} progress={line.progress} delivery={lastDelivery}
            revenue={getManufacturingDashboard(line).revenue} />}
    </div>
  )
}
