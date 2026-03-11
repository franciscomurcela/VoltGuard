import { useState, useEffect, useRef } from 'react'

export default function AnimCounter({ target, duration = 1800, format = true }) {
  const [display, setDisplay] = useState(0)
  const prevTarget = useRef(target)
  const rafRef = useRef(null)

  useEffect(() => {
    const from = prevTarget.current
    const to = target
    const startTime = performance.now()

    const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))

    const animate = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutExpo(progress)
      const current = Math.floor(from + (to - from) * eased)

      setDisplay(current)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        prevTarget.current = to
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration])

  return <span>{format ? display.toLocaleString() : display}</span>
}
