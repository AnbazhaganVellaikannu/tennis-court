import { formatDateLabel, formatTimeLabel, isSlotInPast } from '../utils/slots'

function MyBookings({ bookings, currentUserId, onCancel }) {
  const myBookings = bookings
    .filter((b) => b.userId === currentUserId)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))

  if (myBookings.length === 0) {
    return <p className="empty-state">You don't have any bookings yet. Go book a court!</p>
  }

  return (
    <ul className="booking-list">
      {myBookings.map((booking) => {
        const past = isSlotInPast(booking.date, booking.time)
        return (
          <li key={booking.id} className={`booking-item ${past ? 'booking-past' : ''}`}>
            <div>
              <strong>{booking.courtName}</strong>
              <div className="booking-item-meta">
                {formatDateLabel(booking.date)} &middot; {formatTimeLabel(booking.time)}
                {past && ' (past)'}
              </div>
            </div>
            {!past && (
              <button
                className="secondary-button"
                onClick={() => {
                  onCancel(booking.id).catch(() => {
                    window.alert('Failed to cancel booking. Please try again.')
                  })
                }}
              >
                Cancel
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default MyBookings
