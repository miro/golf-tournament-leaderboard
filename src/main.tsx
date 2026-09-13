import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import './index.css'
import { LeagueProvider } from './contexts/LeagueContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LeagueProvider>
      <BrowserRouter>
        <App />
        <Analytics />
      </BrowserRouter>
    </LeagueProvider>
  </React.StrictMode>,
)
