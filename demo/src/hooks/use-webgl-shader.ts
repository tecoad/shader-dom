import { useEffect, useRef, useCallback, type RefObject } from "react"
import { VERTEX_SHADER } from "@/lib/shaders"

export function useWebGLShader(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  texture: HTMLCanvasElement | null,
  shaderCode: string
) {
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const programRef = useRef<WebGLProgram | null>(null)
  const timeLocRef = useRef<WebGLUniformLocation | null>(null)
  const resLocRef = useRef<WebGLUniformLocation | null>(null)
  const startTime = useRef(Date.now())
  const rafRef = useRef<number>(0)
  const textureRef = useRef<WebGLTexture | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !texture) return

    const gl = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: true })
    if (!gl) return
    glRef.current = gl

    canvas.width = texture.width
    canvas.height = texture.height
    canvas.style.width = texture.width / 2 + "px"
    canvas.style.height = texture.height / 2 + "px"

    const vs = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vs, VERTEX_SHADER)
    gl.compileShader(vs)

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fs, shaderCode)
    gl.compileShader(fs)

    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error("Fragment shader error:", gl.getShaderInfoLog(fs))
      return
    }

    const program = gl.createProgram()!
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.useProgram(program)
    programRef.current = program

    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
    const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0])

    const posBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
    const posLoc = gl.getAttribLocation(program, "a_position")
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    const texBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuf)
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW)
    const texLoc = gl.getAttribLocation(program, "a_texCoord")
    gl.enableVertexAttribArray(texLoc)
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0)

    const glTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, glTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture)
    textureRef.current = glTex

    timeLocRef.current = gl.getUniformLocation(program, "u_time")
    resLocRef.current = gl.getUniformLocation(program, "u_resolution")

    gl.viewport(0, 0, canvas.width, canvas.height)

    if (resLocRef.current) {
      gl.uniform2f(resLocRef.current, canvas.width, canvas.height)
    }

    const render = () => {
      const elapsed = (Date.now() - startTime.current) / 1000
      gl.uniform1f(timeLocRef.current, elapsed)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      rafRef.current = requestAnimationFrame(render)
    }
    render()

    return () => {
      cancelAnimationFrame(rafRef.current)
      gl.deleteTexture(glTex)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [canvasRef, texture, shaderCode])

  const updateTexture = useCallback(() => {
    const gl = glRef.current
    if (!gl || !textureRef.current || !texture) return
    gl.bindTexture(gl.TEXTURE_2D, textureRef.current)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture)
  }, [texture])

  return { updateTexture }
}
