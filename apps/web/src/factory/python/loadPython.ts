export async function loadPython() {
  const directory = new URL(`${import.meta.env.BASE_URL}pyodide/`, self.location.origin)
  const moduleUrl = new URL('pyodide.mjs', directory).href
  const { loadPyodide }: typeof import('pyodide') = await import(/* @vite-ignore */ moduleUrl)
  return loadPyodide({
    indexURL: directory.href,
    jsglobals: Object.create(null),
    stdout: () => {},
    stderr: () => {},
  })
}
