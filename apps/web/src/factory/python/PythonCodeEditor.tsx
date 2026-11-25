import { useEffect, useRef } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import { indentationMarkers } from '@replit/codemirror-indentation-markers'

export function PythonCodeEditor({ code, onChange, label, describedBy, readOnly = false }: {
  code: string
  onChange: (code: string) => void
  label: string
  describedBy?: string
  readOnly?: boolean
}) {
  const parent = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  const changeHandler = useRef(onChange)
  const editable = useRef(new Compartment())
  changeHandler.current = onChange

  useEffect(() => {
    const view = new EditorView({
      parent: parent.current!,
      state: EditorState.create({
        doc: code,
        extensions: [
          lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), history(),
          python(), oneDark, indentUnit.of('    '), EditorState.tabSize.of(4), indentationMarkers(),
          indentOnInput(), bracketMatching(), closeBrackets(),
          keymap.of([...closeBracketsKeymap, indentWithTab, ...defaultKeymap, ...historyKeymap]),
          editable.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          EditorView.contentAttributes.of({
            'aria-label': label,
            ...(describedBy ? { 'aria-describedby': describedBy } : {}),
            spellcheck: 'false',
            autocapitalize: 'off',
          }),
          EditorView.updateListener.of(update => {
            if (update.docChanged) changeHandler.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    editor.current = view
    return () => { view.destroy(); editor.current = null }
    // The view lives for the lifetime of this editor; updates are applied below.
  }, [])

  useEffect(() => {
    const view = editor.current
    if (view && view.state.doc.toString() !== code) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } })
    }
  }, [code])

  useEffect(() => {
    editor.current?.dispatch({ effects: editable.current.reconfigure([
      EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
    ]) })
  }, [readOnly])

  return <div ref={parent} className="weight-code-editor" />
}
