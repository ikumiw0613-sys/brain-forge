import { PythonCodeEditor } from '../../factory/python/PythonCodeEditor'
import './sorting.css'

export function SortingEditor({ code, onChange, describedBy }: {
  code: string
  onChange: (code: string) => void
  describedBy?: string
}) {
  return (
    <div className="sorting-editor">
      <PythonCodeEditor code={code} onChange={onChange} label="sorting.py" describedBy={describedBy} />
    </div>
  )
}
