import { useId } from 'react'
import { ConveyorBelt, Scanner, ShippingGate, Sorter } from './FactoryEquipment'
import './factory.css'

const sceneWidth = 1000
const sceneHeight = 420
const containerWidth = 43
const containerHeight = 40

export function FactoryView({ containerNumbers, selectedNumber, inspectedNumbers, candidateRange, locked, scanning, gateOpen, onSelect }: {
  containerNumbers: readonly number[]
  selectedNumber: number | null
  inspectedNumbers: readonly number[]
  candidateRange?: { first: number; last: number }
  locked: boolean
  scanning: boolean
  gateOpen: boolean
  onSelect: (number: number) => void
}) {
  const id = useId()

  return (
    <section className="panel factory-panel" aria-labelledby={`${id}-heading`}>
      <h2 className="panel-heading" id={`${id}-heading`}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M2.5 17V9l5-3v4l5-3v3l5-3v10zM6 13.5h1m3 0h1m3 0h1" />
        </svg>
        工場ビュー
      </h2>
      <div className="factory-scroll" tabIndex={0} role="region" aria-labelledby={`${id}-heading`}>
        <div className="factory-diagram">
          <FactoryDrawing id={id} scanning={scanning} gateOpen={gateOpen} />
          <div role="radiogroup" aria-label="検品するコンテナ">
            {containerNumbers.map((number, index) => (
              <Container
                key={number}
                number={number}
                x={152 + index * 45}
                groupName={`${id}-containers`}
                selected={selectedNumber === number}
                inspected={inspectedNumbers.includes(number)}
                excluded={Boolean(candidateRange && (number < candidateRange.first || number > candidateRange.last))}
                locked={locked}
                scanning={scanning && selectedNumber === number}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="factory-caption">
        <p><strong>整列順</strong> 左から品質が低い順</p>
        {candidateRange && (candidateRange.first > 1 || candidateRange.last < containerNumbers.length) && (
          <p>破線の枠は候補外</p>
        )}
        <p className="factory-scroll-hint">横スクロールで全体を表示</p>
      </div>
    </section>
  )
}

function FactoryDrawing({ id, scanning, gateOpen }: { id: string; scanning: boolean; gateOpen: boolean }) {
  return (
    <svg
      className="factory-scene"
      viewBox={`0 0 ${sceneWidth} ${sceneHeight}`}
      role="img"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
    >
      <title id={`${id}-title`}>鉱石の検品ラインの設備配置</title>
      <desc id={`${id}-description`}>
        左に自動仕分け機、中央に検品スキャナー、右に出荷ゲートがあり、搬送ベルトでつながっています。
      </desc>
      <defs>
        <pattern id={`${id}-floor`} width="48" height="20" patternUnits="userSpaceOnUse" patternTransform="skewX(38)">
          <path d="M48 0H0V20" fill="none" stroke="#36434a" strokeWidth="1" />
        </pattern>
        <pattern id={`${id}-hazard`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
          <rect width="7" height="14" fill="#d1994b" />
        </pattern>
      </defs>

      <g strokeLinejoin="round">
        <path d="M36 273H904L968 345v13H100L36 286Z" fill="#0e1317" stroke="#39464c" />
        <path d="M36 273H904L968 345H100Z" fill="#1c252b" stroke="#46565e" />
        <path d="M36 273H904L968 345H100Z" fill={`url(#${id}-floor)`} />
        <path d="M102 351H966M105 337H943" fill="none" stroke="#46565e" />
        <path d="M102 326h91m614 0h122" fill="none" stroke="#d1994b" strokeDasharray="6 5" />
      </g>

      <Sorter hazardPattern={`${id}-hazard`} />
      <Scanner active={scanning} />
      <ShippingGate hazardPattern={`${id}-hazard`} open={gateOpen} />
      <ConveyorBelt />

      <g className="equipment-label" transform="translate(108 65)">
        <text y="7">自動仕分け機</text>
        <path d="M0 20v41" />
        <circle cy="61" r="2.5" />
      </g>
      <g className="equipment-label scanner-label" transform="translate(524 65)">
        <text y="7">検品スキャナー</text>
        <path d="M0 20v33" />
        <circle cy="53" r="2.5" />
      </g>
      <g className="equipment-label" transform="translate(903 65)">
        <text y="7">{gateOpen ? '出荷ゲート（開）' : '出荷ゲート'}</text>
        <path d="M0 20v43" />
        <circle cy="63" r="2.5" />
      </g>
      <g className="belt-label" transform="translate(500 390)">
        <path d="M-145 0h66m158 0h66m-6-5 6 5-6 5" />
        <text y="5">搬送ベルト</text>
      </g>
    </svg>
  )
}

function Container({ number, x, groupName, selected, inspected, excluded, locked, scanning, onSelect }: {
  number: number
  x: number
  groupName: string
  selected: boolean
  inspected: boolean
  excluded: boolean
  locked: boolean
  scanning: boolean
  onSelect: (number: number) => void
}) {
  return (
    <label className={excluded ? 'container-control excluded' : 'container-control'} style={{
      left: `${x / sceneWidth * 100}%`,
      top: `${211 / sceneHeight * 100}%`,
      width: `${containerWidth / sceneWidth * 100}%`,
    }}>
      <input
        type="radio"
        name={groupName}
        checked={selected}
        disabled={locked}
        aria-label={`${number}番コンテナ、${inspected ? '検品済み' : '未検品'}${excluded ? '、候補外' : ''}`}
        onChange={() => onSelect(number)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onSelect(number)
          }
        }}
      />
      <svg className="container-art" viewBox={`0 0 ${containerWidth} ${containerHeight}`} aria-hidden="true">
        <g transform="translate(0 8)">
          <path d="M1 32h41v5H1z" fill="#080d10" opacity=".75" />
          <path d="M0 0l8-8h35l-8 8z" fill="#677881" stroke="#91a0a2" />
          <path d="M35 0l8-8v32l-8 8z" fill="#26343c" stroke="#76878c" />
          <rect width="35" height="32" rx="1" fill="#3a4951" stroke="#8e9fa3" />
          <rect className="container-face" x="4" y="4" width="27" height="24" rx="1" fill="#1a262d" stroke="#566971" />
          <path d="M10-5h22m6 10v15" fill="none" stroke="#8a9a9d" strokeOpacity=".7" />
          <text className="container-number" x="17.5" y="22">{number}</text>
          {scanning && <path className="scan-trace" d="M5 5h25" />}
          <path className="container-pointer" d="M12-18h11l-5.5 7z" />
          {inspected && (
            <g className="container-check" transform="translate(35 -4)">
              <circle r="8" />
              <path d="m-3 0 2 2 4-4" />
            </g>
          )}
        </g>
      </svg>
    </label>
  )
}
