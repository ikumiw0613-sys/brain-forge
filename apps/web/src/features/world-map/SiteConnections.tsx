import { connectionPoints } from './siteLayout'
import type { SiteLayout } from './siteLayout'

export function SiteConnections({ layout, delivery }: { layout: SiteLayout; delivery: { readonly orderId: string } | null }) {
  return (
    <g className="map-connections" aria-hidden="true">
      {layout.connections.map(connection => {
        const points = connectionPoints(layout, connection)
        // The middle stretch leaves room for a direction arrow clear of both loading bays.
        const [[x1, y1], [x2, y2]] = connection.via
        const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
        const path = points.map(point => point.join(',')).join(' ')
        return (
          <g key={connection.to[0]} className={connection.future ? 'map-future-route' : 'map-main-route'}
            data-from={connection.from[0]} data-to={connection.to[0]}>
            <polyline className="map-track-edge" points={path} />
            <polyline className="map-track-bed" points={path} />
            <polyline className="map-track-center" points={path} />
            {!connection.future && <path className="map-direction" d="M-5-5 2 0-5 5 M3-5 10 0 3 5"
              transform={`translate(${(x1 + x2) / 2} ${(y1 + y2) / 2}) rotate(${angle})`} />}
            {[points[0], points[points.length - 1]].map(([x, y]) => <circle key={`${x},${y}`} className="map-dock" cx={x} cy={y} r="4" />)}
            {delivery && connection.from[0] === 'warehouse' && connection.to[0] === 'factory' &&
              <g key={delivery.orderId} className="map-cargo" data-delivery={delivery.orderId}
                style={{ offsetPath: `path("M${points.map(point => point.join(' ')).join(' L')}")` }}>
                <path d="M-10-4 3-8 11-4-2 1z" fill="#e8bc76" />
                <path d="M-10-4-2 1-2 9-10 4z" fill="#ae763f" />
                <path d="M-2 1 11-4 11 4-2 9z" fill="#c68c50" />
                <path d="m2 3 5-2" stroke="#f9de9b" />
              </g>}
          </g>
        )
      })}
    </g>
  )
}
