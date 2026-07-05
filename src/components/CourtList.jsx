function CourtList({ courts, onSelect }) {
  return (
    <div className="court-grid">
      {courts.map((court) => (
        <button
          key={court.id}
          className="court-card"
          onClick={() => onSelect(court.id)}
        >
          <div className="court-card-header">
            <h3>{court.name}</h3>
            <span className={`badge ${court.indoor ? 'badge-indoor' : 'badge-outdoor'}`}>
              {court.indoor ? 'Indoor' : 'Outdoor'}
            </span>
          </div>
          <p className="court-address">{court.address}</p>
          <div className="court-meta">
            <span>{court.surface} court</span>
            <span>&middot;</span>
            <span>{court.courtsCount} courts</span>
          </div>
          <div className="court-hours">${court.pricePerHour}/hour</div>
        </button>
      ))}
    </div>
  )
}

export default CourtList
