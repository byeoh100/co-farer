import { Navigate } from 'react-router-dom'

/** The scaffold's /home now goes to My trips (signed-out visitors see the sign-in panel there). */
export default function HomePage() {
  return <Navigate to="/trips" replace />
}
