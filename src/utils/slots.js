export const DEFAULT_OPEN_HOUR = 7
export const DEFAULT_CLOSE_HOUR = 21

export function generateTimeSlots(openHour, closeHour) {
  const slots = []
  for (let hour = openHour; hour < closeHour; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`)
  }
  return slots
}

export function todayISODate() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  const local = new Date(now.getTime() - offset * 60000)
  return local.toISOString().slice(0, 10)
}

export function isSlotInPast(dateISO, time) {
  const [hour] = time.split(':').map(Number)
  const slotDate = new Date(`${dateISO}T00:00:00`)
  slotDate.setHours(hour, 0, 0, 0)
  return slotDate.getTime() < Date.now()
}

export function formatDateLabel(dateISO) {
  const date = new Date(`${dateISO}T00:00:00`)
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function formatTimeLabel(time) {
  const [hour] = time.split(':').map(Number)
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour}:00 ${period}`
}
