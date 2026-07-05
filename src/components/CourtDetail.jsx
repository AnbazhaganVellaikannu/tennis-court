import { useMemo, useState } from 'react'
import {
  generateTimeSlots,
  todayISODate,
  isSlotInPast,
  formatDateLabel,
  formatTimeLabel,
  DEFAULT_OPEN_HOUR,
  DEFAULT_CLOSE_HOUR,
} from '../utils/slots'

function CourtDetail({ court, bookings, onBook, onBack }) {
  const [selectedDate, setSelectedDate] = useState(todayISODate())
  const [pendingSlot, setPendingSlot] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [bookingError, setBookingError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const timeSlots = useMemo(
    () => generateTimeSlots(DEFAULT_OPEN_HOUR, DEFAULT_CLOSE_HOUR),
    []
  )

  const bookingsForDate = bookings.filter(
    (b) => b.courtId === court.id && b.date === selectedDate
  )

  function bookedCount(time) {
    return bookingsForDate.filter((b) => b.time === time).length
  }

  function handleSlotClick(time) {
    setConfirmation(null)
    setBookingError(null)
    setPendingSlot({ time })
  }

  async function handleConfirm(e) {
    e.preventDefault()
    setSubmitting(true)
    setBookingError(null)
    try {
      await onBook({
        courtId: court.id,
        date: selectedDate,
        time: pendingSlot.time,
      })
      setConfirmation(
        `Booked ${court.name} at ${formatTimeLabel(pendingSlot.time)} on ${formatDateLabel(selectedDate)}`
      )
      setPendingSlot(null)
    } catch (err) {
      setBookingError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="court-detail">
      <button className="link-button" onClick={onBack}>
        &larr; Back to courts
      </button>

      <h2>{court.name}</h2>
      <p className="court-address">{court.address}</p>
      <div className="court-meta">
        <span>{court.surface} court</span>
        <span>&middot;</span>
        <span>{court.indoor ? 'Indoor' : 'Outdoor'}</span>
        <span>&middot;</span>
        <span>{court.courtsCount} courts</span>
        <span>&middot;</span>
        <span>${court.pricePerHour}/hour</span>
      </div>

      <label className="date-picker">
        Date
        <input
          type="date"
          value={selectedDate}
          min={todayISODate()}
          onChange={(e) => {
            setSelectedDate(e.target.value)
            setPendingSlot(null)
            setConfirmation(null)
          }}
        />
      </label>

      {confirmation && <div className="confirmation-banner">{confirmation}</div>}

      <div className="slot-list">
        {timeSlots.map((time) => {
          const booked = bookedCount(time)
          const full = booked >= court.courtsCount
          const past = isSlotInPast(selectedDate, time)
          const isPending = pendingSlot?.time === time
          return (
            <button
              key={time}
              className={`slot-button ${full ? 'slot-booked' : ''} ${isPending ? 'slot-pending' : ''}`}
              disabled={full || past}
              onClick={() => handleSlotClick(time)}
            >
              <span className="slot-time">{formatTimeLabel(time)}</span>
              <span className="slot-availability">
                {past ? '—' : full ? 'Full' : `${court.courtsCount - booked} of ${court.courtsCount} free`}
              </span>
            </button>
          )
        })}
      </div>

      {pendingSlot && (
        <form className="booking-form" onSubmit={handleConfirm}>
          <h4>
            Confirm booking &mdash; {court.name} at {formatTimeLabel(pendingSlot.time)} on{' '}
            {formatDateLabel(selectedDate)}
          </h4>
          {bookingError && <p className="booking-error">{bookingError}</p>}
          <div className="booking-form-actions">
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? 'Booking…' : 'Confirm booking'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setPendingSlot(null)}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default CourtDetail
