import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { PythonCodeEditor } from '../../factory/python/PythonCodeEditor'
import { Workspace } from '../../game/workspace/Workspace'
import type { WorkspaceLayout } from '../../game/workspace/windowLayout'
import { runSortingCase } from './runSortingCase'
import { partsPerMinute, repetitions, sortingKinds, sortingSizes, timingFloorMs } from './sortingCases'
import type { SortingCase, SortingKind } from './sortingCases'
import type { SortingResult } from './sortingProtocol'
import './sorting.css'

export const initialSortingCode = `def sort_parts(a):
    for i in range(1, len(a)):
        value = a[i]
        j = i
        while j > 0 and a[j - 1] > value:
            a[j] = a[j - 1]
            j -= 1
        a[j] = value
    return a
`

const learningTarget = {
  size: 1000,
  kinds: ['random', 'reverse', 'duplicates'],
  partsPerMinute: 1_000_000,
} satisfies { size: (typeof sortingSizes)[number]; kinds: SortingKind[]; partsPerMinute: number }

const verdicts = {
  passed: '正解', wrong: '不正解', 'invalid-result': '不正な戻り値', exception: '実行エラー', timeout: 'タイムアウト', stopped: '中断',
}
const number = (value: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: 2 })

function measuredRate(result: Extract<SortingResult, { status: 'passed' }>) {
  return partsPerMinute(result.size, Math.max(result.ms, timingFloorMs))!
}

function SortingResults({ results }: { results: readonly SortingResult[] }) {
  return (
    <div className="sorting-table" tabIndex={0} role="region" aria-label="テストケース別結果">
      <table>
        <thead><tr><th scope="col">件数</th><th scope="col">入力</th><th scope="col">判定</th>
          <th scope="col">実行時間（中央値）</th><th scope="col">分間処理件数</th></tr></thead>
        <tbody>{results.map(result => {
          const belowFloor = result.status === 'passed' && result.ms < timingFloorMs
          return <tr key={`${result.size}-${result.kind}`}>
            <th scope="row">{number(result.size)}</th><td>{sortingKinds[result.kind]}</td>
            <td>{verdicts[result.status]}{result.status !== 'passed' && <details><summary>詳細</summary><p>{result.detail}</p></details>}</td>
            <td>{result.status !== 'passed' ? '—' : belowFloor ? `< ${timingFloorMs} ms` : `${number(result.ms)} ms`}</td>
            <td>{result.status === 'passed' ? `${belowFloor ? '≥ ' : ''}${number(measuredRate(result))} 件/分` : '—'}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
  )
}

export function SortingScreen({ code, onChange, workspace, warehouseEditor }: {
  code: string
  onChange: (code: string) => void
  workspace: WorkspaceLayout
  warehouseEditor: ReactNode
}) {
  const [size, setSize] = useState(String(learningTarget.size))
  const [kind, setKind] = useState<SortingKind | 'all'>('all')
  const [seed, setSeed] = useState('42')
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'stopped'>('idle')
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState<SortingResult[]>([])
  const active = useRef<AbortController | null>(null)
  const seedNumber = Number(seed)
  const validSeed = /^-?\d+$/.test(seed) && Number.isInteger(seedNumber) && seedNumber >= -2147483648 && seedNumber <= 2147483647
  const running = status === 'running'
  const graded = results.filter(result => result.status !== 'stopped').length
  const correct = results.filter(result => result.status === 'passed').length
  const targetCases = learningTarget.kinds.map(kind =>
    results.find(result => result.size === learningTarget.size && result.kind === kind))
  const targetStatus = status !== 'completed' || targetCases.some(result => !result) ? '未判定'
    : correct === graded && targetCases.every(result => result?.status === 'passed' && measuredRate(result) >= learningTarget.partsPerMinute)
      ? '達成' : '未達成'
  const statusText = {
    idle: '試験前', running: progress, completed: `完了 · ${correct}/${graded} ケース正解`, stopped: '中断',
  }[status]

  useEffect(() => () => {
    const run = active.current
    active.current = null
    run?.abort()
  }, [])

  async function start() {
    if (active.current || !validSeed || !code.trim()) return
    const run = new AbortController()
    active.current = run
    setStatus('running')
    setResults([])
    const kinds = kind === 'all' ? Object.keys(sortingKinds) as SortingKind[] : [kind]
    const cases: SortingCase[] = (size === 'all' ? sortingSizes : [Number(size)])
      .flatMap(size => kinds.map(kind => ({ size, kind, seed: seedNumber })))
    const collected: SortingResult[] = []
    for (const testCase of cases) {
      const label = `${number(testCase.size)}件・${sortingKinds[testCase.kind]}`
      const progress = `${collected.length + 1}/${cases.length} · ${label}`
      setProgress(`準備中 · ${progress}`)
      const result = await runSortingCase(testCase, code, run.signal, () => setProgress(`実行中 · ${progress}`))
      if (active.current !== run) return
      collected.push(result)
      setResults([...collected])
      if (run.signal.aborted) break
    }
    active.current = null
    setStatus(run.signal.aborted ? 'stopped' : 'completed')
  }

  return (
    <div className="manufacturing sorting">
      <header className="manufacturing-header"><div><strong>Brain Forge</strong>
        <a className="manufacturing-map-link" href={`${import.meta.env.BASE_URL}map/`}>工場マップ</a>
      </div></header>
      <main className="manufacturing-main">
        <div className="manufacturing-title"><h1>仕分け施設</h1><span>利用可能 · 学習モード</span></div>
        <p className="sorting-instructions" id="sorting-code-help"><code>sorting.py</code> の <code>sort_parts(a)</code> に整数リストが渡されます。昇順に並べ替えたリストを返してください。</p>
        <p className="sorting-instructions">工場の初期仕分けでは、起動時点の下書きを使います。</p>
        <Workspace layout={workspace} defaultTab="sorting" panels={{
          python: warehouseEditor,
          sorting: <div className="sorting-editor">
            <PythonCodeEditor code={code} onChange={onChange} label="sorting.py" describedBy="sorting-code-help" />
          </div>,
        }} />
        <div className="sorting-controls">
          <section className="manufacturing-panel sorting-panel" aria-labelledby="sorting-test-title">
            <h2 id="sorting-test-title">ソート性能試験</h2>
            <fieldset disabled={running}>
              <legend>試験条件</legend>
              <label>入力件数<select value={size} onChange={event => setSize(event.target.value)}>
                <option value="all">すべて</option>
                {sortingSizes.map(size => <option key={size} value={size}>{number(size)}</option>)}
              </select></label>
              <label>入力の種類<select value={kind} onChange={event => setKind(event.target.value as SortingKind | 'all')}>
                <option value="all">すべて</option>
                {Object.entries(sortingKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select></label>
              <label>seed<input type="text" inputMode="numeric" value={seed} aria-invalid={!validSeed}
                onChange={event => setSeed(event.target.value)} /></label>
            </fieldset>
            {!validSeed && <p>seedには32ビット符号付き整数を入力してください。</p>}
            <div className="manufacturing-buttons">
              <button type="button" className="manufacturing-primary" disabled={running || !validSeed || !code.trim()} onClick={start}>試験開始</button>
              <button type="button" disabled={!running} onClick={() => active.current?.abort()}>中断</button>
            </div>
            <p>試験開始時点の <code>sorting.py</code> を使用します。</p>
            <p role="status">{statusText}</p>
          </section>
          <section className="manufacturing-panel sorting-panel" aria-labelledby="sorting-goal-title">
            <h2 id="sorting-goal-title">学習用の性能目標（暫定）</h2>
            <ul>
              <li>正答率 100% が必須</li>
              <li>{number(learningTarget.size)} 件の{learningTarget.kinds.map(kind => sortingKinds[kind]).join('・')}で、各 {number(learningTarget.partsPerMinute)} 件/分以上</li>
            </ul>
            <p>この端末での参考値です。<code>sorted()</code> の技術解放条件とは独立しています。</p>
            <p>目標の判定 {targetStatus}</p>
          </section>
        </div>
        <section className="manufacturing-panel sorting-panel" aria-labelledby="sorting-results-title">
          <h2 id="sorting-results-title">テストケース別結果</h2>
          <p>正答率 <strong>{graded ? `${number(correct * 100 / graded)}%` : '—'}</strong>
            {graded > 0 && `（${correct}/${graded} ケース）`}</p>
          <p>同じ入力を {repetitions} 回試し、関数の実行時間の中央値を表示します。{timingFloorMs} ms未満は分間処理件数の下限を表示します。</p>
          {results.length > 0 && <SortingResults results={results} />}
        </section>
      </main>
    </div>
  )
}
