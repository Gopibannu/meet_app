import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Home.css'

export default function Home() {
  const [meetingId, setMeetingId] = useState('')
  const [userName, setUserName] = useState('')
  const navigate = useNavigate()

  const createMeeting = () => {
    const id = Math.random().toString(36).substring(2, 10)
    const name = userName.trim() || 'Host'
    localStorage.setItem('userName', name)
    navigate(`/meeting/${id}`)
  }

  const joinMeeting = () => {
    if (!meetingId.trim()) return
    const name = userName.trim() || 'Guest'
    localStorage.setItem('userName', name)
    navigate(`/meeting/${meetingId.trim()}`)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') joinMeeting()
  }

  return (
    <div className="home">
      <nav className="navbar">
        <div className="nav-brand">
          <div className="logo-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="14" height="13" rx="2" fill="#0e71eb"/>
              <path d="M16 8.5L22 5v14l-6-3.5V8.5z" fill="#0e71eb"/>
            </svg>
          </div>
          <span className="brand-name">ZoomClone</span>
        </div>
        <div className="nav-links">
          <a href="#" className="nav-link">Home</a>
          <a href="#" className="nav-link">Products</a>
          <a href="#" className="nav-link">Support</a>
        </div>
      </nav>

      <main className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            Video meetings for{' '}
            <span className="gradient-text">everyone</span>
          </h1>
          <p className="hero-subtitle">
            Connect with anyone, anywhere. Free video conferencing with screen sharing, chat, and more.
          </p>

          <div className="name-input-wrapper">
            <label className="input-label">Your Name</label>
            <input
              className="input-field"
              type="text"
              placeholder="Enter your name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </div>

          <div className="action-cards">
            <div className="card create-card">
              <div className="card-icon blue">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                </svg>
              </div>
              <button className="btn btn-primary" onClick={createMeeting}>
                New Meeting
              </button>
              <p className="card-desc">Start instant meeting</p>
            </div>

            <div className="divider-or">
              <span>or</span>
            </div>

            <div className="card join-card">
              <div className="card-icon green">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/>
                  <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
              </div>
              <input
                className="input-field"
                type="text"
                placeholder="Enter meeting code"
                value={meetingId}
                onChange={(e) => setMeetingId(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className="btn btn-secondary"
                onClick={joinMeeting}
                disabled={!meetingId.trim()}
              >
                Join Meeting
              </button>
            </div>
          </div>

          <div className="features">
            <div className="feature">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span>HD Video & Audio</span>
            </div>
            <div className="feature">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
              <span>Screen Sharing</span>
            </div>
            <div className="feature">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
              <span>In-meeting Chat</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
