// Vite's raw import: the file's text.
declare module '*.svg?raw' {
  const text: string
  export default text
}
