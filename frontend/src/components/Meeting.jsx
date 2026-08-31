import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import './Meeting.css'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
}

export default function Meeting() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const userName = localStorage.getItem('userName') || 'Guest'

  const [localStream, setLocalStream] = useState(null)
  const [peers, setPeers] = useState({})
  const [isVideoOn, setIsVideoOn] = useState(true)
  const [isAudioOn, setIsAudioOn] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [participants, setParticipants] = useState([])
  const [copied, setCopied] = useState(false)

  const socketRef = useRef(null)
  const peersRef = useRef({})
  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const localVideoRef = useRef(null)
  const remoteVideoRefs = useRef({})

  const createPeer = useCallback(async (userId, isInitiator) => {
    if (peersRef.current[userId]) return peersRef.current[userId]

    const peer = new RTCPeerConnection(ICE_SERVERS)
    peersRef.current[userId] = peer

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, localStreamRef.current)
      })
    }

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current.emit('ice-candidate', {
          to: userId,
          candidate: e.candidate,
        })
      }
    }

    peer.ontrack = (e) => {
      setPeers((prev) => {
        const existing = prev[userId] || { stream: null, name: '' }
        return { ...prev, [userId]: { ...existing, stream: e.streams[0] } }
      })
    }

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
        removePeer(userId)
      }
    }

    if (isInitiator) {
      try {
        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        socketRef.current.emit('offer', { to: userId, offer: peer.localDescription })
      } catch (err) {
        console.error('Error creating offer:', err)
      }
    }

    return peer
  }, [])

  const removePeer = useCallback((userId) => {
    if (peersRef.current[userId]) {
      peersRef.current[userId].close()
      delete peersRef.current[userId]
    }
    setPeers((prev) => {
      const next = { ...prev }
      delete next[userId]
      return next
    })
    setParticipants((prev) => prev.filter((p) => p.id !== userId))
  }, [])

  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        })
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        localStreamRef.current = stream
        setLocalStream(stream)
      } catch (err) {
        console.error('Media access error:', err)
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          if (!mounted) {
            stream.getTracks().forEach((t) => t.stop())
            return
          }
          localStreamRef.current = stream
          setLocalStream(stream)
          setIsVideoOn(false)
        } catch {
          alert('Could not access camera or microphone')
        }
      }

      const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin
      const socket = io(backendUrl, { transports: ['websocket', 'polling'] })
      socketRef.current = socket

      socket.on('connect', () => {
        socket.emit('join-room', { roomId, userName })
      })

      socket.on('room-users', (users) => {
        users.forEach((user) => {
          createPeer(user.id, true)
        })
        setParticipants(users.map((u) => ({ ...u, videoOff: false, audioOff: false })))
      })

      socket.on('user-joined', ({ userId, userName: name, users }) => {
        setParticipants(users.filter((u) => u.id !== socket.id).map((u) => ({ ...u, videoOff: false, audioOff: false })))
      })

      socket.on('offer', async ({ from, offer }) => {
        try {
          const peer = await createPeer(from, false)
          await peer.setRemoteDescription(new RTCSessionDescription(offer))
          const answer = await peer.createAnswer()
          await peer.setLocalDescription(answer)
          socketRef.current.emit('answer', { to: from, answer: peer.localDescription })
        } catch (err) {
          console.error('Error handling offer:', err)
        }
      })

      socket.on('answer', async ({ from, answer }) => {
        const peer = peersRef.current[from]
        if (peer) {
          try {
            await peer.setRemoteDescription(new RTCSessionDescription(answer))
          } catch (err) {
            console.error('Error setting answer:', err)
          }
        }
      })

      socket.on('ice-candidate', async ({ from, candidate }) => {
        const peer = peersRef.current[from]
        if (peer) {
          try {
            await peer.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (err) {
            console.error('Error adding ICE candidate:', err)
          }
        }
      })

      socket.on('chat-message', ({ message, userName: name, timestamp }) => {
        setMessages((prev) => [...prev, { message, userName: name, timestamp, isOwn: name === userName }])
      })

      socket.on('user-left', ({ userId }) => {
        removePeer(userId)
      })

      socket.on('user-toggle-video', ({ userId, muted }) => {
        setParticipants((prev) =>
          prev.map((p) => (p.id === userId ? { ...p, videoOff: muted } : p))
        )
      })

      socket.on('user-toggle-audio', ({ userId, muted }) => {
        setParticipants((prev) =>
          prev.map((p) => (p.id === userId ? { ...p, audioOff: muted } : p))
        )
      })
    }

    init()

    return () => {
      mounted = false
      Object.values(peersRef.current).forEach((p) => p.close())
      peersRef.current = {}
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop())
      if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach((t) => t.stop())
      socketRef.current?.disconnect()
    }
  }, [roomId, userName, createPeer, removePeer])

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  const toggleVideo = () => {
    if (!localStream) return
    const videoTrack = localStream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled
      setIsVideoOn(videoTrack.enabled)
      socketRef.current?.emit('toggle-video', { roomId, muted: !videoTrack.enabled })
    }
  }

  const toggleAudio = () => {
    if (!localStream) return
    const audioTrack = localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      setIsAudioOn(audioTrack.enabled)
      socketRef.current?.emit('toggle-audio', { roomId, muted: !audioTrack.enabled })
    }
  }

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null
      const videoTrack = localStream?.getVideoTracks()[0]
      if (videoTrack) {
        Object.values(peersRef.current).forEach((peer) => {
          const sender = peer.getSenders().find((s) => s.track?.kind === 'video')
          if (sender) sender.replaceTrack(videoTrack)
        })
      }
      setIsScreenSharing(false)
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        screenStreamRef.current = screenStream
        const screenTrack = screenStream.getVideoTracks()[0]
        Object.values(peersRef.current).forEach((peer) => {
          const sender = peer.getSenders().find((s) => s.track?.kind === 'video')
          if (sender) sender.replaceTrack(screenTrack)
        })
        screenTrack.onended = () => {
          toggleScreenShare()
        }
        setIsScreenSharing(true)
      } catch {
        console.log('Screen share cancelled')
      }
    }
  }

  const sendMessage = () => {
    if (!chatInput.trim()) return
    socketRef.current?.emit('chat-message', {
      roomId,
      message: chatInput.trim(),
      userName,
    })
    setMessages((prev) => [
      ...prev,
      { message: chatInput.trim(), userName, timestamp: Date.now(), isOwn: true },
    ])
    setChatInput('')
  }

  const leaveMeeting = () => {
    socketRef.current?.emit('leave-room')
    navigate('/')
  }

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const peerKeys = Object.keys(peers)
  const totalParticipants = peerKeys.length + 1

  const getGridClass = () => {
    if (totalParticipants === 1) return 'grid-single'
    if (totalParticipants === 2) return 'grid-double'
    if (totalParticipants <= 4) return 'grid-quad'
    return 'grid-multi'
  }

  return (
    <div className="meeting">
      <div className={`video-container ${chatOpen ? 'with-chat' : ''}`}>
        <div className="top-bar">
          <div className="meeting-info">
            <span className="meeting-id-label">Meeting ID:</span>
            <span className="meeting-id-value">{roomId}</span>
            <button className="copy-btn" onClick={copyRoomId}>
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
              )}
            </button>
          </div>
          <div className="participants-count">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/>
              <path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <span>{totalParticipants}</span>
          </div>
        </div>

        <div className={`video-grid ${getGridClass()}`}>
          <div className="video-cell local-cell">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="video-element"
              style={{ transform: 'scaleX(-1)' }}
            />
            <div className="video-overlay">
              <span className="video-name">{userName} (You)</span>
              {!isVideoOn && (
                <div className="video-off-placeholder">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                  </svg>
                  <span>{userName.charAt(0).toUpperCase()}</span>
                </div>
              )}
            </div>
          </div>

          {peerKeys.map((userId) => (
            <RemoteVideo
              key={userId}
              userId={userId}
              peer={peers[userId]}
              participants={participants}
            />
          ))}
        </div>

        <div className="controls-bar">
          <div className="controls-group">
            <button
              className={`control-btn ${!isAudioOn ? 'off' : ''}`}
              onClick={toggleAudio}
              title={isAudioOn ? 'Mute' : 'Unmute'}
            >
              {isAudioOn ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                  <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23"/>
                  <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/>
                  <path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .37-.03.74-.08 1.1"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              )}
            </button>

            <button
              className={`control-btn ${!isVideoOn ? 'off' : ''}`}
              onClick={toggleVideo}
              title={isVideoOn ? 'Stop Video' : 'Start Video'}
            >
              {isVideoOn ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              )}
            </button>

            <button
              className={`control-btn ${isScreenSharing ? 'active' : ''}`}
              onClick={toggleScreenShare}
              title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </button>
          </div>

          <div className="controls-group center-controls">
            <button
              className="control-btn leave-btn"
              onClick={leaveMeeting}
              title="Leave Meeting"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
              <span>Leave</span>
            </button>
          </div>

          <div className="controls-group">
            <button
              className={`control-btn ${chatOpen ? 'active' : ''}`}
              onClick={() => setChatOpen(!chatOpen)}
              title="Chat"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
              {messages.length > 0 && !chatOpen && (
                <span className="badge">{messages.length > 9 ? '9+' : messages.length}</span>
              )}
            </button>

            <button className="control-btn" title="Participants">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                <path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {chatOpen && (
        <div className="chat-panel">
          <div className="chat-header">
            <h3>In-meeting Chat</h3>
            <button className="chat-close" onClick={() => setChatOpen(false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <p>No messages yet</p>
                <span>Send a message to everyone in the meeting</span>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.isOwn ? 'own' : ''}`}>
                {!msg.isOwn && <span className="msg-author">{msg.userName}</span>}
                <span className="msg-text">{msg.message}</span>
                <span className="msg-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
          <div className="chat-input-area">
            <input
              className="chat-input"
              type="text"
              placeholder="Type a message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button className="send-btn" onClick={sendMessage} disabled={!chatInput.trim()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function RemoteVideo({ userId, peer, participants }) {
  const videoRef = useRef(null)
  const participant = participants.find((p) => p.id === userId)

  useEffect(() => {
    if (videoRef.current && peer?.stream) {
      videoRef.current.srcObject = peer.stream
    }
  }, [peer?.stream])

  return (
    <div className="video-cell remote-cell">
      <video ref={videoRef} autoPlay playsInline className="video-element" style={{ transform: 'scaleX(-1)' }} />
      <div className="video-overlay">
        <span className="video-name">{participant?.name || 'Participant'}</span>
        {participant?.videoOff && (
          <div className="video-off-placeholder">
            <span>{(participant?.name || 'P').charAt(0).toUpperCase()}</span>
          </div>
        )}
        {participant?.audioOff && (
          <div className="muted-indicator">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/>
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}
