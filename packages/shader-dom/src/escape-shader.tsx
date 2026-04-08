import type { ReactNode } from "react"
import { ESCAPE_ATTR } from "./escape"

export interface EscapeShaderProps {
  children: ReactNode
}

export function EscapeShader({ children }: EscapeShaderProps) {
  const props = { [ESCAPE_ATTR]: true }
  return (
    <div {...props} style={{ pointerEvents: "none" }}>
      {children}
    </div>
  )
}
