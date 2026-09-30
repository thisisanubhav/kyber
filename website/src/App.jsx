import { useEffect, useId, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { submitCareerApplication } from './api'

export const BOOKING_URL = 'https://calendar.app.google/xSoWj2GgaaHrZmRH7'
const APP_LOGIN_URL = 'http://localhost:4174/login'

const navClass = ({ isActive }) => `nav-link${isActive ? ' active' : ''}`

function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [industriesOpen, setIndustriesOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
    setIndustriesOpen(false)
  }, [location.pathname])

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <div className="hiring-strip">● NOW HIRING <Link to="/careers">FOUNDING ROLES &nbsp; VIEW CAREERS →</Link></div>
      <header className="site-header">
        <Link to="/" className="brand" aria-label="Kyber home">Kyber</Link>
        <button
          className="menu-button"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>
        <nav id="primary-navigation" className={menuOpen ? 'nav open' : 'nav'} aria-label="Primary navigation">
          <NavLink className={navClass} to="/">Home</NavLink>
          <div className="nav-dropdown">
            <button
              className="nav-link dropdown-button"
              type="button"
              aria-expanded={industriesOpen}
              aria-controls="industries-menu"
              onClick={() => setIndustriesOpen((value) => !value)}
            >
              Industries <span aria-hidden="true">⌄</span>
            </button>
            <div id="industries-menu" className={industriesOpen ? 'dropdown open' : 'dropdown'}>
              <NavLink className={navClass} to="/industries/aviation">Aviation</NavLink>
              <NavLink className={navClass} to="/industries/other">Other industries</NavLink>
            </div>
          </div>
          <NavLink className={navClass} to="/team">Team</NavLink>
          <NavLink className={navClass} to="/careers">Careers</NavLink>
          <a className="nav-link login-link" href={APP_LOGIN_URL}>Login ↗</a>
          <a className="button small" href={BOOKING_URL} target="_blank" rel="noreferrer">Contact sales →</a>
        </nav>
      </header>
    </>
  )
}

function SalesCta({ title = 'Run your operation on time, every time.' }) {
  return (
    <section className="sales-cta" aria-labelledby="sales-cta-title">
      <div>
        <p className="eyebrow">Talk to the founding team</p>
        <h2 id="sales-cta-title">{title}</h2>
        <p>Bring us your hardest coordination problem. We’ll show you what Kyber can change.</p>
      </div>
      <a className="button" href={BOOKING_URL} target="_blank" rel="noreferrer">Book a call <span aria-hidden="true">→</span></a>
    </section>
  )
}

function AiChat() {
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')

  function submit(event) {
    event.preventDefault()
    if (!message.trim()) return
    setReply('Thanks — this local preview does not send messages. Book a call to discuss your operation with our team.')
  }

  return (
    <section className="chat-panel" aria-labelledby="chat-title">
      <div className="chat-status"><span>// KYBER AI · 01</span><span>LIVE</span></div>
      <h2 id="chat-title">What does your team coordinate?</h2>
      <p>Tell us, or start with aviation, fleet operations, or field crews.</p>
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="chat-message">Message Kyber AI</label>
        <input
          id="chat-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Describe your operation…"
        />
        <button className="button" type="submit" disabled={!message.trim()}>Send →</button>
      </form>
      {reply && <p className="chat-reply" role="status">{reply}</p>}
    </section>
  )
}

function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <p className="eyebrow">AI workforce coordination for critical infrastructure</p>
        <h1>We plan and coordinate your workforce using AI to run critical infrastructure <em>on time, every time.</em></h1>
        <div className="hero-lower">
          <div>
            <p className="lede">Our customers operate on time with just the resources they need.</p>
            <a className="button hero-cta" href={BOOKING_URL} target="_blank" rel="noreferrer">Book a call →</a>
            <ul className="benefits">
              <li>Higher staff productivity</li>
              <li>Less overtime</li>
              <li>Fewer controllable delays</li>
            </ul>
          </div>
          <AiChat />
        </div>
      </section>
      <section className="metrics" aria-label="Operational results">
        <div><strong>35%</strong><span>higher productivity</span></div>
        <div><strong>15%</strong><span>less overtime</span></div>
        <div><strong>12%</strong><span>fewer delays</span></div>
        <div><strong>98%</strong><span>tasks completed</span></div>
      </section>
      <SalesCta />
    </>
  )
}

const operatingModels = {
  team: {
    label: 'Team-based',
    title: 'Coordinate every turnaround team in real time',
    copy: 'Kyber keeps crews together while dynamically assigning the best-positioned team to each aircraft and responding to delays.',
  },
  task: {
    label: 'Task-based',
    title: 'Assign every task to the best available person',
    copy: 'Kyber continuously recomputes individual assignments as flights, equipment, locations, and qualifications change.',
  },
}

function Aviation() {
  const [model, setModel] = useState('team')
  const selected = operatingModels[model]
  return (
    <>
      <PageHero eyebrow="Aviation" title="Ground operations that adapt before disruption becomes delay." copy="Kyber gives dispatchers one live operating plan across flights, crews, equipment, locations, and constraints." />
      <section className="content-section">
        <p className="eyebrow">Product modules</p>
        <div className="disclosures">
          <details>
            <summary>01 · Plan before the day begins <span aria-hidden="true">+</span></summary>
            <p>Build feasible rosters and resource plans around demand, qualifications, equipment, breaks, and service-level commitments.</p>
          </details>
          <details>
            <summary>02 · Coordinate live operations <span aria-hidden="true">+</span></summary>
            <p>Replan continuously as arrivals move, staff availability changes, and urgent work appears.</p>
          </details>
        </div>
      </section>
      <section className="content-section model-section" aria-labelledby="model-title">
        <p className="eyebrow">Operating models</p>
        <h2 id="model-title">Built for the way you operate</h2>
        <div className="tabs" role="tablist" aria-label="Operating model">
          {Object.entries(operatingModels).map(([key, item]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={model === key}
              aria-controls="operating-model-panel"
              onClick={() => setModel(key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div id="operating-model-panel" className="tab-panel" role="tabpanel">
          <h3>{selected.title}</h3>
          <p>{selected.copy}</p>
        </div>
      </section>
      <SalesCta title="See how Kyber fits your ground operation." />
    </>
  )
}

function OtherIndustries() {
  return (
    <>
      <PageHero eyebrow="Other industries" title="The same coordination problem exists everywhere time matters." copy="We work with complex fleet, field-service, depot, and logistics operations where plans must adapt continuously." />
      <section className="cards content-section">
        <article><span>01</span><h2>Fleet operations</h2><p>Keep vehicles, depots, drivers, and service commitments aligned as conditions change.</p></article>
        <article><span>02</span><h2>Field crews</h2><p>Assign qualified teams to urgent work without losing sight of the rest of the day.</p></article>
        <article><span>03</span><h2>Critical logistics</h2><p>Coordinate people and equipment around narrow windows and hard dependencies.</p></article>
      </section>
      <AiChat />
      <SalesCta />
    </>
  )
}

function Team() {
  return (
    <>
      <PageHero eyebrow="Team" title="We build systems for the people keeping the world moving." copy="Kyber is an operations and AI company headquartered in London, working alongside teams on the ground." />
      <section className="content-section split-copy">
        <div><p className="eyebrow">Our belief</p><h2>The plan should change as fast as reality does.</h2></div>
        <p>Critical operations still rely on spreadsheets, radios, and human heroics. We combine operations research, real-time systems, and practical AI to give teams a live plan they can trust.</p>
      </section>
      <SalesCta title="Build the future of operations with us." />
    </>
  )
}

const roles = [
  { id: 'founding-engineer', title: 'Founding Engineer — Full Stack' },
  { id: 'optimization-engineer', title: 'Optimization Engineer' },
  { id: 'operations-research-scientist', title: 'Operations Research Scientist' },
  { id: 'founding-commercial-lead', title: 'Founding Commercial Lead' },
]

function validateFile(file, allowed, maxMb) {
  if (!file) return ''
  if (!allowed.includes(file.type)) return `Choose a supported file type (${allowed.map((type) => type.split('/').pop()).join(', ')}).`
  if (file.size > maxMb * 1024 * 1024) return `File must be ${maxMb} MB or smaller.`
  return ''
}

function ApplicationForm({ role, onSubmitApplication = submitCareerApplication }) {
  const baseId = useId().replace(/:/g, '')
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function checkFile(event, kind) {
    const file = event.target.files?.[0]
    const error = kind === 'cv'
      ? validateFile(file, ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], 5)
      : validateFile(file, ['video/mp4', 'video/quicktime', 'video/webm'], 50)
    setErrors((current) => ({ ...current, [kind]: error }))
  }

  async function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.checkValidity()) {
      form.reportValidity()
      return
    }
    if (Object.values(errors).some(Boolean)) return
    const data = new FormData(form)
    const cv = data.get('cv')
    const video = data.get('video')
    setSubmitting(true)
    setNotice('')
    try {
      await onSubmitApplication({
        jobId: role.id,
        fullName: String(data.get('name')),
        email: String(data.get('email')),
        linkedinUrl: String(data.get('linkedin')),
        cv,
        video: video instanceof File && video.size > 0 ? video : null,
      })
      form.reset()
      setNotice('Application received locally. Files passed upload validation and are being scanned before review.')
    } catch (requestError) {
      setErrors((current) => ({ ...current, submit: requestError instanceof Error ? requestError.message : 'The application could not be submitted.' }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="application-form" onSubmit={submit} noValidate={false}>
      <p className="form-intro"><strong>Apply for {role.title}</strong><br />Start with your details and CV. A video is optional at this stage; it simply helps us learn what motivates you. We may invite you to record one later.</p>
      <label htmlFor={`${baseId}-name`}>01 · Full name</label>
      <input id={`${baseId}-name`} name="name" autoComplete="name" required />
      <label htmlFor={`${baseId}-email`}>02 · Email</label>
      <input id={`${baseId}-email`} name="email" type="email" autoComplete="email" required />
      <label htmlFor={`${baseId}-linkedin`}>03 · LinkedIn profile</label>
      <input id={`${baseId}-linkedin`} name="linkedin" type="url" placeholder="https://linkedin.com/in/…" required />
      <label htmlFor={`${baseId}-cv`}>04 · CV <span aria-hidden="true">*</span></label>
      <input id={`${baseId}-cv`} name="cv" type="file" accept=".pdf,.doc,.docx" required onChange={(event) => checkFile(event, 'cv')} aria-describedby={`${baseId}-cv-help${errors.cv ? ` ${baseId}-cv-error` : ''}`} />
      <small id={`${baseId}-cv-help`}>PDF, DOC, or DOCX. Maximum 5 MB.</small>
      {errors.cv && <p id={`${baseId}-cv-error`} className="field-error" role="alert">{errors.cv}</p>}
      <label htmlFor={`${baseId}-video`}>05 · One-minute introduction <span className="optional">Optional</span></label>
      <input id={`${baseId}-video`} name="video" type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event) => checkFile(event, 'video')} aria-describedby={`${baseId}-video-help${errors.video ? ` ${baseId}-video-error` : ''}`} />
      <small id={`${baseId}-video-help`}>MP4, MOV, or WebM. Maximum 50 MB. You can also share this later.</small>
      {errors.video && <p id={`${baseId}-video-error`} className="field-error" role="alert">{errors.video}</p>}
      <button className="button" type="submit" disabled={submitting}>{submitting ? 'Uploading securely…' : 'Submit application →'}</button>
      {errors.submit && <p className="field-error" role="alert">{errors.submit}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </form>
  )
}

function Careers() {
  return (
    <>
      <PageHero eyebrow="Careers" title="Founding roles for people who want to change how operations run." copy="Join a small team solving consequential coordination problems across critical infrastructure." />
      <section className="content-section role-list" aria-labelledby="roles-title">
        <p className="eyebrow">Open positions</p>
        <h2 id="roles-title">Four founding roles</h2>
        <p className="candidate-note">Applications begin with basic details and a CV. A one-minute introduction video is optional; candidates can provide it now or later in the process.</p>
        {roles.map((role) => (
          <details key={role.id}>
            <summary>{role.title}<span aria-hidden="true">+</span></summary>
            <div className="role-layout">
              <div><p className="eyebrow">What Kyber brings</p><p>You’ll work directly with customers and the founding team on algorithms and products used in live, time-critical operations.</p><p className="eyebrow">The challenge</p><p>Turn complex constraints and constantly changing conditions into simple, trustworthy decisions.</p></div>
              <ApplicationForm role={role} />
            </div>
          </details>
        ))}
      </section>
    </>
  )
}

function PageHero({ eyebrow, title, copy }) {
  return <section className="page-hero"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lede">{copy}</p></section>
}

const legal = {
  privacy: ['Privacy Policy', 'We collect only the information needed to provide our services, respond to enquiries, improve the website, and meet legal obligations.', 'You may contact info@joinkyber.com to ask about access, correction, deletion, or other privacy rights.'],
  cookies: ['Cookie Policy', 'We use essential storage for site operation and optional analytics only when you allow it.', 'You can reopen cookie preferences below at any time.'],
  terms: ['Terms of Use', 'These terms govern use of the Kyber website. Do not misuse the site, interfere with its operation, or attempt unauthorised access.', 'Product services are governed by the agreement between Kyber and the relevant customer.'],
}

function LegalPage({ type, openPreferences }) {
  const [title, first, second] = legal[type]
  return (
    <article className="legal-page">
      <p className="eyebrow">Legal · Updated September 2026</p>
      <h1>{title}</h1>
      <h2>Overview</h2><p>{first}</p>
      <h2>Your choices</h2><p>{second}</p>
      {type === 'cookies' && <button className="text-button" type="button" onClick={openPreferences}>Open cookie settings</button>}
      <h2>Contact</h2><p>Email <a href="mailto:info@joinkyber.com">info@joinkyber.com</a>.</p>
    </article>
  )
}

function CookiePreferences({ open, setOpen }) {
  const [analytics, setAnalytics] = useState(false)
  useEffect(() => {
    const saved = localStorage.getItem('kyber-cookie-preferences')
    if (!saved) setOpen(true)
    else setAnalytics(JSON.parse(saved).analytics === true)
  }, [setOpen])

  function save() {
    localStorage.setItem('kyber-cookie-preferences', JSON.stringify({ essential: true, analytics }))
    setOpen(false)
  }

  if (!open) return null
  return (
    <div className="cookie-overlay" role="presentation">
      <section className="cookie-panel" role="dialog" aria-modal="true" aria-labelledby="cookie-title">
        <h2 id="cookie-title">Cookie preferences</h2>
        <p>Essential storage keeps the site working. Analytics helps us understand aggregate use and is optional.</p>
        <div className="cookie-row"><span>Essential</span><span>Always on</span></div>
        <label className="cookie-row"><span>Analytics</span><input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} /></label>
        <button className="button" type="button" onClick={save}>Save preferences</button>
      </section>
    </div>
  )
}

function Footer({ openPreferences }) {
  return (
    <footer>
      <Link className="brand" to="/">Kyber</Link>
      <div><Link to="/privacy">Privacy</Link><Link to="/cookies">Cookie Policy</Link><Link to="/terms">Terms</Link><button type="button" onClick={openPreferences}>Cookie settings</button></div>
      <div><a href="mailto:info@joinkyber.com">info@joinkyber.com</a><a href="https://trust.joinkyber.com" target="_blank" rel="noreferrer">Trust Center ↗</a><a href="https://www.linkedin.com/company/kyberglobal" target="_blank" rel="noreferrer">LinkedIn ↗</a></div>
    </footer>
  )
}

function NotFound() {
  return <section className="page-hero"><p className="eyebrow">404</p><h1>That page isn’t here.</h1><Link className="button" to="/">Return home</Link></section>
}

export default function App() {
  const [cookiesOpen, setCookiesOpen] = useState(false)
  return (
    <div className="app-shell">
      <Header />
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/industries/aviation" element={<Aviation />} />
          <Route path="/industries/other" element={<OtherIndustries />} />
          <Route path="/team" element={<Team />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/privacy" element={<LegalPage type="privacy" openPreferences={() => setCookiesOpen(true)} />} />
          <Route path="/cookies" element={<LegalPage type="cookies" openPreferences={() => setCookiesOpen(true)} />} />
          <Route path="/terms" element={<LegalPage type="terms" openPreferences={() => setCookiesOpen(true)} />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer openPreferences={() => setCookiesOpen(true)} />
      <CookiePreferences open={cookiesOpen} setOpen={setCookiesOpen} />
    </div>
  )
}
