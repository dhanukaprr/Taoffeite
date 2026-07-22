import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams
} from 'react-router-dom';
import { api, formatDate, money } from './api';

const AuthContext = createContext(null);
const CurrencyContext = createContext(null);
const ToastContext = createContext(null);

function useAuth() { return useContext(AuthContext); }
function useCurrency() { return useContext(CurrencyContext); }
function useToast() { return useContext(ToastContext); }

function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [currency, setCurrency] = useState(() => localStorage.getItem('to_currency') || 'USD');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api('/auth/me').then(({ user: current }) => setUser(current)).catch(() => setUser(null)).finally(() => setAuthReady(true));
  }, []);

  useEffect(() => { localStorage.setItem('to_currency', currency); }, [currency]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  const auth = useMemo(() => ({ user, setUser, authReady }), [user, authReady]);
  const currencyValue = useMemo(() => ({ currency, setCurrency }), [currency]);

  return (
    <AuthContext.Provider value={auth}>
      <CurrencyContext.Provider value={currencyValue}>
        <ToastContext.Provider value={setToast}>
          <ScrollToTop />
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="collection" element={<ListingsPage mode="collection" />} />
              <Route path="live-auctions" element={<ListingsPage mode="live" />} />
              <Route path="private-collection" element={<PrivateCollectionPage />} />
              <Route path="auction/:id" element={<AuctionPage />} />
              <Route path="about" element={<AboutPage />} />
              <Route path="contact" element={<ContactPage />} />
              <Route path="assistance" element={<AssistancePage />} />
              <Route path="sign-in" element={<AuthPage mode="login" />} />
              <Route path="admin/login" element={<AuthPage mode="login" />} />
              <Route path="sign-up" element={<AuthPage mode="register" />} />
              <Route path="setup" element={<SetupPage />} />
              <Route path="dashboard" element={<Protected><DashboardPage /></Protected>} />
              <Route path="checkout/:auctionId" element={<Protected><CheckoutPage /></Protected>} />
              <Route path="admin" element={<Protected admin><AdminPage /></Protected>} />
              <Route path="admin/auctions/:id" element={<Protected admin><AdminAuctionDetailPage /></Protected>} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
          {toast && <div className={`toast ${toast.type || ''}`}>{toast.message || toast}</div>}
        </ToastContext.Provider>
      </CurrencyContext.Provider>
    </AuthContext.Provider>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  return null;
}

function Protected({ children, admin = false }) {
  const { user, authReady } = useAuth();
  const location = useLocation();
  if (!authReady) return <PageLoader />;
  if (!user) return <Navigate to="/sign-in" state={{ from: location.pathname }} replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}

function Layout() {
  return (
    <div className="site-shell">
      <Header />
      <main><Outlet /></main>
      <Footer />
    </div>
  );
}

function Header() {
  const { user, setUser } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    navigate('/');
  }
  const close = () => setOpen(false);
  return (
    <>
      <div className="announcement">Direct from origin · Certified gemstones · Worldwide delivery</div>
      <header className="header">
        <Link to="/" className="brand" onClick={close} aria-label="Taaffeite Origin home">
          <span className="brand-script">Taaffeite Origin</span>
          <span className="brand-sub">THE RARE, REVEALED</span>
        </Link>
        <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? '×' : '☰'}</button>
        <nav className={open ? 'nav open' : 'nav'}>
          <NavLink to="/live-auctions" onClick={close}>Live auctions</NavLink>
          <NavLink to="/collection" onClick={close}>Collection</NavLink>
          <NavLink to="/private-collection" onClick={close}>Private collection</NavLink>
          <NavLink to="/about" onClick={close}>Our story</NavLink>
          <NavLink to="/contact" onClick={close}>Contact</NavLink>
        </nav>
        <div className="header-actions">
          <select aria-label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
            <option>USD</option><option>LKR</option><option>GBP</option>
          </select>
          {user ? (
            <div className="account-menu">
              <Link to={user.role === 'admin' ? '/admin' : '/dashboard'}>Hi, {user.name.split(' ')[0]}</Link>
              <button className="text-button" onClick={logout}>Sign out</button>
            </div>
          ) : <Link className="sign-link" to="/sign-in">Sign in</Link>}
        </div>
      </header>
    </>
  );
}

function Footer() {
  const [email, setEmail] = useState('');
  const toast = useToast();
  async function subscribe(event) {
    event.preventDefault();
    try {
      await api('/newsletter', { method: 'POST', body: { email } });
      setEmail('');
      toast({ type: 'success', message: 'You’re on the list. We’ll share the next gemstone drop.' });
    } catch (error) { toast({ type: 'error', message: error.message }); }
  }
  return (
    <footer>
      <section className="newsletter">
        <div><span className="eyebrow">Stay informed</span><h2>Join the next direct-from-mine drop.</h2></div>
        <form onSubmit={subscribe}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email address" required /><button className="button light">Notify me</button></form>
      </section>
      <section className="footer-main">
        <div className="footer-brand"><span className="brand-script">Taaffeite Origin</span><p>Rare stones with a clear path from source to collector.</p><a href="mailto:hello@taaffeiteorigin.com">hello@taaffeiteorigin.com</a></div>
        <div><h3>Assistance</h3><Link to="/assistance">How to auction</Link><Link to="/contact?request=stone">Find a stone</Link><Link to="/assistance#delivery">Delivery</Link><Link to="/assistance#cancel">How to cancel bids</Link></div>
        <div><h3>Explore</h3><Link to="/about">About us</Link><Link to="/contact">Contact us</Link><Link to="/private-collection">Private collection</Link><Link to="/live-auctions">Live auctions</Link></div>
        <div><h3>Visit</h3><p>Colombo, Sri Lanka</p><p>Private viewings by appointment.</p></div>
      </section>
      <div className="footer-legal"><span>© {new Date().getFullYear()} Taaffeite Origin</span><span>Terms · Privacy · Authenticity guaranteed</span></div>
    </footer>
  );
}

function HomePage() {
  const [auctions, setAuctions] = useState([]);
  useEffect(() => { api('/auctions?status=live&sort=popular').then((r) => setAuctions(r.auctions.slice(0, 3))).catch(() => {}); }, []);
  return (
    <>
      <section className="hero">
        <div className="hero-overlay"><span className="live-dot"><i /> Live auction</span><h1>The 12.4C<br />Violet Heirloom</h1><p>Direct from Ratnapura · unheated · oval</p><Link to="/auction/1" className="button">Place bid now</Link></div>
        <a href="#current-lots" className="scroll-cue">Explore current lots <span>↓</span></a>
      </section>
      <section className="section" id="current-lots">
        <SectionHeading eyebrow="At auction now" title="Current high-value lots" text="Exceptional gemstones with transparent provenance and live bidding." action={<Link to="/live-auctions">View all live auctions →</Link>} />
        {auctions.length ? <div className="card-grid">{auctions.map((auction) => <AuctionCard key={auction.id} auction={auction} />)}</div> : <CardSkeletons />}
      </section>
      <section className="origin-story">
        <div className="origin-image"><img src="/assets/violet-taaffeite.jpg" alt="Violet Taaffeite gemstone" /><span>01 / Provenance</span></div>
        <div className="origin-copy"><span className="eyebrow">Inside every stone</span><h2>A story millions of years in the making.</h2><p>From Sri Lanka’s gem-rich earth to the hands of a collector, every stone follows a path we can stand behind. We work closely with experienced local partners, preserve certification at every step, and remove unnecessary intermediaries.</p><Link to="/about" className="inline-link">Discover our origin <span>→</span></Link></div>
      </section>
      <section className="services-strip">
        <div><span className="service-number">01</span><h3>Directly sourced</h3><p>Strong relationships within Sri Lanka’s mining community.</p></div>
        <div><span className="service-number">02</span><h3>Independently certified</h3><p>Every listed stone is authenticated by a trusted laboratory.</p></div>
        <div><span className="service-number">03</span><h3>Globally delivered</h3><p>Insured worldwide shipping with personal support.</p></div>
      </section>
      <section className="private-callout"><div><span className="eyebrow">By invitation</span><h2>The Private Collection</h2><p>Discover our rarest and most exceptional stones, reserved for approved collectors.</p><Link className="button outline-light" to="/private-collection">Request access</Link></div></section>
    </>
  );
}

function SectionHeading({ eyebrow, title, text, action }) {
  return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{text && <p>{text}</p>}</div>{action && <div className="section-action">{action}</div>}</div>;
}

function ListingsPage({ mode }) {
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', status: mode === 'live' ? 'live' : '', category: '', sort: 'popular' });
  const [categories, setCategories] = useState([]);
  useEffect(() => { api('/categories').then((r) => setCategories(r.categories)).catch(() => {}); }, []);
  useEffect(() => {
    setLoading(true);
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
    const timer = setTimeout(() => api(`/auctions?${query}`).then((r) => setAuctions(r.auctions)).catch(() => setAuctions([])).finally(() => setLoading(false)), 180);
    return () => clearTimeout(timer);
  }, [filters]);
  const title = mode === 'live' ? 'Live auctions' : 'The collection';
  return (
    <div className="page-wrap">
      <PageHero eyebrow="Gemstones at origin" title={title} text={mode === 'live' ? 'Bid in real time on verified gemstones selected for character, rarity, and provenance.' : 'Explore live, forthcoming, and recently completed gemstone auctions.'} />
      <div className="filters">
        <label className="search-field"><span>⌕</span><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search by keyword or product ID" /></label>
        <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option value="">All gemstone types</option>{categories.map((category) => <option value={category.slug} key={category.id}>{category.name}</option>)}</select>
        {mode !== 'live' && <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Any auction status</option><option value="live">Live</option><option value="scheduled">Opening soon</option><option value="ended">Sold</option></select>}
        <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}><option value="popular">Most popular</option><option value="ending">Ending soon</option><option value="high">Current bid: high to low</option><option value="low">Current bid: low to high</option><option value="newest">Newest</option></select>
      </div>
      <div className="results-line"><span>{loading ? 'Searching…' : `${auctions.length} ${auctions.length === 1 ? 'stone' : 'stones'}`}</span><span>Availability updates in real time</span></div>
      {loading ? <CardSkeletons /> : auctions.length ? <div className="card-grid listing-grid">{auctions.map((auction) => <AuctionCard key={auction.id} auction={auction} />)}</div> : <EmptyState title="No stones match these filters" text="Try removing a filter or search for another gemstone." />}
    </div>
  );
}

function AuctionCard({ auction, onWatchChange }) {
  const { currency } = useCurrency();
  const { user } = useAuth();
  const toast = useToast();
  const [watched, setWatched] = useState(Boolean(auction.watched));
  async function toggleWatch(event) {
    event.preventDefault();
    if (!user) return toast({ type: 'error', message: 'Sign in to save auctions to your watchlist.' });
    try {
      await api(`/watchlist/${auction.id}`, { method: watched ? 'DELETE' : 'POST' });
      setWatched(!watched); onWatchChange?.(auction.id, !watched);
    } catch (error) { toast({ type: 'error', message: error.message }); }
  }
  const live = auction.status === 'live';
  return (
    <Link to={`/auction/${auction.id}`} className="auction-card">
      <div className="card-image"><img src={auction.primary_image || '/assets/violet-taaffeite.jpg'} alt={auction.name} /><span className={`status-pill ${auction.status}`}>{live ? <><i /> Auction live</> : auction.status === 'scheduled' ? 'Opening soon' : 'Sold'}</span><button onClick={toggleWatch} className={watched ? 'watch active' : 'watch'} aria-label="Watch auction">{watched ? '♥' : '♡'}</button></div>
      <div className="card-body"><div className="card-title"><h3>{auction.name}</h3><span>{auction.product_code}</span></div><p>{[auction.treatment, auction.weight_carats && `${auction.weight_carats} ct`, auction.cut_shape].filter(Boolean).join(' · ')}</p><div className="bid-row"><div><span>{auction.type === 'sealed' && live ? 'Sealed bid' : live ? auction.type === 'reverse' ? 'Current offer' : 'Current bid' : auction.status === 'scheduled' ? 'Starting bid' : 'Final bid'}</span><strong>{money(auction.type === 'sealed' && live ? null : auction.current_price, auction.currency, currency)}</strong></div><div className="countdown-small"><span>{live ? 'Closes in' : auction.status === 'scheduled' ? 'Opens in' : 'Closed'}</span>{auction.status !== 'ended' && <Countdown date={live ? auction.ends_at : auction.starts_at} compact />}</div></div><span className="card-cta">{live ? 'Place bid' : auction.status === 'scheduled' ? 'View details' : 'View stone'} <b>→</b></span></div>
    </Link>
  );
}

function Countdown({ date, compact = false }) {
  const calculate = () => Math.max(0, new Date(date).getTime() - Date.now());
  const [left, setLeft] = useState(calculate);
  useEffect(() => { const timer = setInterval(() => setLeft(calculate()), 1000); return () => clearInterval(timer); }, [date]);
  const d = Math.floor(left / 86400000);
  const h = Math.floor((left % 86400000) / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  if (compact) return <strong>{d ? `${d}d ` : ''}{String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</strong>;
  return <div className="countdown"><div><strong>{String(d).padStart(2, '0')}</strong><span>Days</span></div><i>:</i><div><strong>{String(h).padStart(2, '0')}</strong><span>Hours</span></div><i>:</i><div><strong>{String(m).padStart(2, '0')}</strong><span>Minutes</span></div><i>:</i><div><strong>{String(s).padStart(2, '0')}</strong><span>Seconds</span></div></div>;
}

function AuctionPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { currency } = useCurrency();
  const toast = useToast();
  const navigate = useNavigate();
  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [amount, setAmount] = useState('');
  const [auto, setAuto] = useState(false);
  const [maximumAmount, setMaximumAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try { const data = await api(`/auctions/${id}`); setAuction(data.auction); }
    catch (error) { setAuction({ error: error.message, accessRequired: error.payload?.accessRequired }); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (!auction?.id || auction.status !== 'live') return undefined;
    const stream = new EventSource(`/api/auctions/${id}/events`);
    stream.addEventListener('auction', (event) => {
      const update = JSON.parse(event.data);
      setAuction((current) => ({ ...current, current_price: update.currentPrice ?? current.current_price, ends_at: update.endsAt, bid_count: Number(current.bid_count) + update.bidCountDelta }));
    });
    return () => stream.close();
  }, [auction?.id, auction?.status, id]);
  useEffect(() => {
    if (!auction?.id || auction.status !== 'live') return undefined;
    const timer = setInterval(() => {
      api(`/auctions/${id}`).then((data) => setAuction(data.auction)).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [auction?.id, auction?.status, id]);

  useEffect(() => {
    if (!auction?.id) return;
    const base = Number(auction.current_price || auction.starting_price);
    setAmount(String(auction.type === 'reverse' ? Math.max(1, base - Number(auction.minimum_increment)) : base + Number(auction.minimum_increment)));
  }, [auction?.id, auction?.current_price]);

  async function placeBid() {
    setSubmitting(true);
    try {
      const result = await api(`/auctions/${id}/bids`, { method: 'POST', body: { amount: Number(amount), maximumAmount: auto ? Number(maximumAmount) : null } });
      toast({ type: 'success', message: result.leading ? 'Your bid is leading.' : 'Bid placed. An automatic bid is still ahead.' });
      setModal(null); await load();
    } catch (error) { toast({ type: 'error', message: error.message }); }
    finally { setSubmitting(false); }
  }
  async function buyNow() {
    setSubmitting(true);
    try { const result = await api(`/auctions/${id}/buy-now`, { method: 'POST' }); navigate(result.checkout); }
    catch (error) { toast({ type: 'error', message: error.message }); }
    finally { setSubmitting(false); setModal(null); }
  }
  if (loading) return <PageLoader />;
  if (auction?.error) return <ErrorPage title={auction.accessRequired ? 'Private access required' : 'Stone unavailable'} text={auction.error} action={auction.accessRequired && <Link className="button" to="/private-collection">Request access</Link>} />;
  const live = auction.status === 'live';
  const image = auction.images?.[0]?.file_path || auction.primary_image;
  const canBuyNow = live && auction.buy_now_price && Number(auction.bid_count) === 0;
  return (
    <div className="auction-page">
      <div className="breadcrumb"><Link to="/">Home</Link><span>/</span><Link to="/live-auctions">Live auctions</Link><span>/</span><b>{auction.product_code}</b></div>
      <section className="auction-detail">
        <div className="gallery"><div className="main-image"><img src={image} alt={auction.name} /><span className={`status-pill ${auction.status}`}>{live ? <><i /> Auction live</> : auction.status === 'scheduled' ? 'Opening soon' : 'Auction ended'}</span></div>{auction.images?.length > 1 && <div className="thumbnails">{auction.images.map((item) => <img src={item.file_path} alt={item.alt_text || auction.name} key={item.id} />)}</div>}</div>
        <div className="auction-panel">
          <span className="eyebrow">{auction.category} · {auction.product_code}</span><h1>{auction.name}</h1><p className="stone-meta">{[auction.weight_carats && `${auction.weight_carats} carats`, auction.treatment, auction.origin].filter(Boolean).join(' · ')}</p>
          {live ? <div className="clock-box"><span>Auction closes in</span><Countdown date={auction.ends_at} /></div> : auction.status === 'scheduled' ? <div className="clock-box"><span>Auction opens in</span><Countdown date={auction.starts_at} /></div> : null}
          <div className="current-bid"><div><span>{auction.type === 'sealed' && live ? 'Current bidding' : auction.type === 'reverse' ? 'Current offer' : live ? 'Current bid' : 'Final bid'}</span><strong>{money(auction.current_price, auction.currency, currency)}</strong></div><p>{auction.bid_count} {Number(auction.bid_count) === 1 ? 'bid' : 'bids'} placed</p></div>
          {live ? <div className="bid-controls"><label><span>{auction.type === 'reverse' ? 'Your offer' : 'Your bid'} ({auction.currency})</span><div className="money-input"><span>$</span><input type="number" step={auction.minimum_increment} value={amount} onChange={(e) => setAmount(e.target.value)} /></div></label>{auction.type === 'standard' && <label className="check-line"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /><span>Bid automatically up to a maximum</span></label>}{auto && <label><span>Maximum auto-bid ({auction.currency})</span><div className="money-input"><span>$</span><input type="number" value={maximumAmount} onChange={(e) => setMaximumAmount(e.target.value)} /></div></label>}<button className="button full" onClick={() => user ? setModal('bid') : navigate('/sign-in', { state: { from: `/auction/${id}` } })}>Place bid</button>{canBuyNow && <button className="button secondary full" onClick={() => user ? setModal('buy') : navigate('/sign-in')}>Buy now for {money(auction.buy_now_price, auction.currency, currency)}</button>}<small>Minimum increment: {money(auction.minimum_increment, auction.currency, currency)}. Bids are final.</small></div> : <div className="auction-closed">{auction.status === 'scheduled' ? 'Bidding has not opened yet. Save this auction to follow its progress.' : 'This auction has ended.'}</div>}
          <div className="assurance"><span>◇ Certified authentic</span><span>◎ Insured delivery</span><span>⌁ Direct provenance</span></div>
        </div>
      </section>
      <section className="stone-content"><div><span className="eyebrow">Inside every stone</span><h2>The story of {auction.name}</h2><p>{auction.story || auction.description}</p><p>{auction.description}</p></div><div className="details-table"><h3>Stone details</h3>{[['Product ID', auction.product_code], ['Type', auction.category], ['Weight', auction.weight_carats && `${auction.weight_carats} ct`], ['Dimensions', auction.dimensions], ['Shape', auction.cut_shape], ['Treatment', auction.treatment], ['Colour', auction.colour], ['Origin', auction.origin], ['Certification', auction.certification_lab]].map(([label, value]) => value && <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
      <section className="bids-section"><div><span className="eyebrow">Auction activity</span><h2>Recent bids</h2></div>{auction.recentBids?.length ? <div className="bid-list">{auction.recentBids.map((bid) => <div key={bid.id}><span className="bidder-mark">{bid.bidder?.[0] || '•'}</span><span><strong>{bid.bidder}</strong><small>{formatDate(bid.created_at)}</small></span><b>{money(bid.amount, auction.currency, currency)}</b></div>)}</div> : <p className="muted">Be the first to place a bid on this stone.</p>}</section>
      {modal && <Modal onClose={() => setModal(null)}><span className="eyebrow">Confirm your commitment</span><h2>{modal === 'buy' ? 'Acquire this stone now?' : `Place ${money(amount, auction.currency, currency)}?`}</h2><p>{modal === 'buy' ? `This will immediately end the auction at ${money(auction.buy_now_price, auction.currency, currency)}.` : 'Bids cannot usually be cancelled. The auction may extend if this bid is placed near closing time.'}</p><div className="modal-actions"><button className="button" disabled={submitting} onClick={modal === 'buy' ? buyNow : placeBid}>{submitting ? 'Submitting…' : 'Yes, confirm'}</button><button className="button ghost" onClick={() => setModal(null)}>Cancel</button></div></Modal>}
    </div>
  );
}

function PrivateCollectionPage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [auctions, setAuctions] = useState([]);
  const [form, setForm] = useState({ occupation: '', country: '', interest: '' });
  useEffect(() => { if (user?.private_access === 'approved') api('/auctions?private=true').then((r) => setAuctions(r.auctions)).catch(() => {}); }, [user]);
  async function request(event) {
    event.preventDefault();
    if (!user) return navigate('/sign-in', { state: { from: '/private-collection' } });
    try { await api('/private-access', { method: 'POST', body: form }); setUser({ ...user, private_access: 'pending' }); toast({ type: 'success', message: 'Your request has been sent to our private client team.' }); }
    catch (error) { toast({ type: 'error', message: error.message }); }
  }
  if (user?.private_access === 'approved') return <div className="page-wrap"><PageHero eyebrow="Private client access" title="The Private Collection" text="Exceptional stones selected for rarity, provenance, and enduring character." /><div className="card-grid listing-grid">{auctions.map((auction) => <AuctionCard auction={auction} key={auction.id} />)}</div></div>;
  return (
    <div className="private-page"><section className="private-hero"><div><span className="eyebrow">By invitation</span><h1>The rarest,<br />kept closer.</h1><p>Our Private Collection is reserved for exceptional gemstones and a small circle of approved collectors.</p></div></section><section className="access-section"><div><span className="eyebrow">Request access</span><h2>Welcome to Taaffeite Origin.</h2><p>Access is granted selectively to protect the provenance and value of these pieces. A one-time membership fee may apply after approval.</p><ul><li>First view of rare Taaffeite and museum-quality stones</li><li>Private bidding and sealed auction formats</li><li>Direct support from our gemstone concierge</li></ul></div>{user?.private_access === 'pending' ? <div className="success-panel"><span>✓</span><h3>Your request is under review</h3><p>Our private client team will contact you after reviewing your details.</p></div> : <form className="form-card" onSubmit={request}><label>Occupation or area of work<input value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} required /></label><label>Country<input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} required /></label><label>Tell us what you collect<textarea value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })} rows="5" required /></label><button className="button full">{user ? 'Submit request' : 'Sign in to request access'}</button></form>}</section></div>
  );
}

function AuthPage({ mode }) {
  const login = mode === 'login';
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  async function submit(event) {
    event.preventDefault(); setLoading(true);
    try { const data = await api(`/auth/${login ? 'login' : 'register'}`, { method: 'POST', body: form }); setUser(data.user); navigate(location.state?.from || (data.user.role === 'admin' ? '/admin' : '/dashboard')); }
    catch (error) { toast({ type: 'error', message: error.message }); }
    finally { setLoading(false); }
  }
  return <div className="auth-page"><div className="auth-art"><div><span className="eyebrow">A clearer way to collect</span><h2>Every stone begins with a story.</h2></div></div><div className="auth-form"><span className="brand-script">Taaffeite Origin</span><span className="eyebrow">{login ? 'Welcome back' : 'Create your account'}</span><h1>{login ? 'Sign in to continue' : 'Begin your collection'}</h1><form onSubmit={submit}>{!login && <label>Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required /></label>}<label>Email address<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required /></label><label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={login ? undefined : 8} autoComplete={login ? 'current-password' : 'new-password'} required /></label><button className="button full" disabled={loading}>{loading ? 'Please wait…' : login ? 'Sign in' : 'Create account'}</button></form><p>{login ? 'New to Taaffeite Origin?' : 'Already have an account?'} <Link to={login ? '/sign-up' : '/sign-in'}>{login ? 'Sign up' : 'Sign in'}</Link></p></div></div>;
}

function DashboardPage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('watchlist');
  const [profile, setProfile] = useState({ name: user.name, phone: user.phone || '' });
  useEffect(() => { api('/dashboard').then(setData).catch((error) => toast({ type: 'error', message: error.message })); }, []);
  async function saveProfile(event) { event.preventDefault(); try { const result = await api('/auth/me', { method: 'PATCH', body: profile }); setUser(result.user); toast({ type: 'success', message: 'Profile updated.' }); } catch (error) { toast({ type: 'error', message: error.message }); } }
  if (!data) return <PageLoader />;
  const tabs = [['watchlist', `Watchlist (${data.watchlist.length})`], ['bids', `Bidding (${data.bids.length})`], ['orders', `Orders (${data.orders.length})`], ['notifications', `Updates (${data.notifications.filter((n) => !n.read_at).length})`], ['profile', 'Profile']];
  return <div className="dashboard page-wrap"><PageHero eyebrow="Your account" title={`Welcome, ${user.name.split(' ')[0]}`} text="Follow auctions, review your bidding history, and complete winning orders." /><div className="dashboard-layout"><aside>{tabs.map(([key, label]) => <button className={tab === key ? 'active' : ''} onClick={() => setTab(key)} key={key}>{label}</button>)}</aside><section className="dashboard-content">{tab === 'watchlist' && <><h2>Saved auctions</h2>{data.watchlist.length ? <div className="card-grid">{data.watchlist.map((item) => <AuctionCard key={item.id} auction={item} />)}</div> : <EmptyState title="Your watchlist is empty" text="Save an auction to follow its progress here." action={<Link className="button" to="/collection">Explore collection</Link>} />}</>}{tab === 'bids' && <><h2>Your bidding activity</h2><DataTable headers={['Stone', 'Bid', 'Type', 'Placed', 'Position']}>{data.bids.map((bid) => <tr key={bid.id}><td><Link to={`/auction/${bid.auction_id}`}>{bid.name}</Link></td><td>{money(bid.amount, bid.currency)}</td><td>{bid.source}</td><td>{formatDate(bid.created_at)}</td><td><span className={bid.is_winning ? 'tag success' : 'tag'}>{bid.is_winning ? 'Leading' : 'Outbid'}</span></td></tr>)}</DataTable></>}{tab === 'orders' && <><h2>Your orders</h2><DataTable headers={['Order', 'Stone', 'Total', 'Payment', 'Action']}>{data.orders.map((order) => <tr key={order.id}><td>{order.order_number}</td><td>{order.name}</td><td>{money(order.total, order.currency)}</td><td><span className={`tag ${order.payment_status === 'paid' ? 'success' : ''}`}>{order.payment_status}</span></td><td><Link to={`/checkout/${order.auction_id}`}>{order.payment_status === 'paid' ? 'View' : 'Complete payment'} →</Link></td></tr>)}</DataTable></>}{tab === 'notifications' && <><h2>Updates</h2><div className="notification-list">{data.notifications.map((note) => <Link to={note.link || '#'} className={note.read_at ? '' : 'unread'} key={note.id}><span>{note.type === 'won' ? '◇' : note.type === 'outbid' ? '↑' : '•'}</span><div><strong>{note.title}</strong><p>{note.message}</p><small>{formatDate(note.created_at)}</small></div></Link>)}</div></>}{tab === 'profile' && <><h2>Profile details</h2><form className="form-card compact" onSubmit={saveProfile}><label>Full name<input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label><label>Email address<input value={user.email} disabled /></label><label>Phone number<input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></label><button className="button">Save changes</button></form></>}</section></div></div>;
}

function CheckoutPage() {
  const { auctionId } = useParams();
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [form, setForm] = useState({ shippingName: '', shippingEmail: '', shippingPhone: '', address1: '', address2: '', city: '', postalCode: '', country: '', paymentReference: '', notes: '', agree: false });
  const [complete, setComplete] = useState(false);
  useEffect(() => { api(`/orders/${auctionId}`).then(({ order }) => { setOrder(order); setForm((f) => ({ ...f, shippingName: order.shipping_name || '', shippingEmail: order.shipping_email || '', shippingPhone: order.shipping_phone || '', address1: order.shipping_address1 || '', address2: order.shipping_address2 || '', city: order.shipping_city || '', postalCode: order.shipping_postal_code || '', country: order.shipping_country || '', paymentReference: order.payment_reference || '' })); }).catch((error) => toast({ type: 'error', message: error.message })); }, [auctionId]);
  async function submit(event) { event.preventDefault(); try { await api(`/orders/${auctionId}/checkout`, { method: 'POST', body: form }); setComplete(true); } catch (error) { toast({ type: 'error', message: error.message }); } }
  if (!order) return <PageLoader />;
  if (complete) return <ErrorPage success title="Payment details received" text="Our team will verify your payment and contact you with insured delivery details." action={<Link className="button" to="/dashboard">Return to dashboard</Link>} />;
  return <div className="checkout page-wrap"><div className="breadcrumb"><Link to="/">Home</Link><span>/</span><b>Checkout</b></div><PageHero eyebrow={`Winning order ${order.order_number}`} title="Complete your purchase" text="Payment must be completed within 24 hours to secure your gemstone." /><form className="checkout-grid" onSubmit={submit}><div className="checkout-form"><h2>Delivery information</h2><div className="field-grid"><label className="wide">Full name<input value={form.shippingName} onChange={(e) => setForm({ ...form, shippingName: e.target.value })} required /></label><label>Email<input type="email" value={form.shippingEmail} onChange={(e) => setForm({ ...form, shippingEmail: e.target.value })} required /></label><label>Phone number<input value={form.shippingPhone} onChange={(e) => setForm({ ...form, shippingPhone: e.target.value })} /></label><label className="wide">Address line 1<input value={form.address1} onChange={(e) => setForm({ ...form, address1: e.target.value })} required /></label><label className="wide">Address line 2 <em>Optional</em><input value={form.address2} onChange={(e) => setForm({ ...form, address2: e.target.value })} /></label><label>City<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required /></label><label>Postal code<input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} /></label><label className="wide">Country<input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} required /></label></div><h2>Payment method</h2><div className="payment-box"><strong>Secure bank transfer</strong><p>Use the Product ID <b>{order.product_code}</b> as your payment reference. Bank details are provided by our client team after identity verification.</p><label>Payment reference <em>Optional until transfer</em><input value={form.paymentReference} onChange={(e) => setForm({ ...form, paymentReference: e.target.value })} /></label></div><label className="check-line agreement"><input type="checkbox" checked={form.agree} onChange={(e) => setForm({ ...form, agree: e.target.checked })} required /><span>I confirm my commitment to purchase this item based on my winning bid.</span></label><button className="button">Submit payment details</button></div><aside className="order-summary"><h2>Order summary</h2><div className="order-stone"><img src={order.primary_image} alt={order.name} /><div><strong>{order.name}</strong><span>{order.product_code}</span></div></div><div className="summary-lines"><div><span>Winning bid</span><b>{money(order.subtotal, order.currency)}</b></div><div><span>Service fee</span><b>{money(order.service_fee, order.currency)}</b></div><div><span>Delivery</span><b>Calculated separately</b></div><div className="total"><span>Total</span><strong>{money(order.total, order.currency)}</strong></div></div><small>Taxes and insured delivery, where applicable, will be confirmed before dispatch.</small></aside></form></div>;
}

function AboutPage() {
  return <div><PageHero eyebrow="Our story" title="From the City of Gems to the world." text="A family legacy, a direct sourcing network, and a belief that collecting rare stones should be more transparent." /><section className="editorial"><div className="editorial-image"><img src="/assets/rose-sapphire.jpg" alt="Rare pink gemstone" /></div><div><span className="eyebrow">Taaffeite Origin</span><h2>Built close to the source.</h2><p>Rooted in Ratnapura, Sri Lanka’s world-renowned City of Gems, our journey is shaped by generations of natural-stone knowledge and deep relationships within the mining industry.</p><p>Taaffeite Origin was created to bring gemstones directly from trusted sources to buyers around the world, without unnecessary intermediaries. What began as a conversation between two friends became a modern marketplace where provenance and access matter equally.</p><p>Each stone is carefully selected and independently certified. Our long-term vision is a global marketplace connecting verified sellers and collectors while preserving the trust, transparency, and heritage that define Sri Lankan gems.</p></div></section><section className="values"><div><span>01</span><h3>Trust before transaction</h3><p>Clear condition, provenance, certification, and bidding terms.</p></div><div><span>02</span><h3>Access without excess</h3><p>A direct path that respects both source communities and collectors.</p></div><div><span>03</span><h3>Rarity with responsibility</h3><p>Thoughtful selection, independent verification, and insured delivery.</p></div></section></div>;
}

function ContactPage() {
  const location = useLocation();
  const toast = useToast();
  const stoneMode = new URLSearchParams(location.search).get('request') === 'stone';
  const [mode, setMode] = useState(stoneMode ? 'stone' : 'contact');
  const [contact, setContact] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [stone, setStone] = useState({ name: '', email: '', gemstoneType: '', weight: '', dimensions: '', treatment: '', shape: '', colour: '', notes: '' });
  async function submit(event) { event.preventDefault(); try { await api(mode === 'stone' ? '/stone-requests' : '/contact', { method: 'POST', body: mode === 'stone' ? stone : contact }); toast({ type: 'success', message: mode === 'stone' ? 'Your stone request has been received.' : 'Your message has been sent.' }); mode === 'stone' ? setStone({ name: '', email: '', gemstoneType: '', weight: '', dimensions: '', treatment: '', shape: '', colour: '', notes: '' }) : setContact({ name: '', email: '', phone: '', subject: '', message: '' }); } catch (error) { toast({ type: 'error', message: error.message }); } }
  return <div className="page-wrap"><PageHero eyebrow="Get in touch" title="We would love to hear from you." text="Speak with our team about a stone, an auction, delivery, or becoming a trusted vendor." /><section className="contact-grid"><aside><h3>Connect with us</h3><div><span>Email</span><a href="mailto:hello@taaffeiteorigin.com">hello@taaffeiteorigin.com</a></div><div><span>Telephone</span><a href="tel:+94115555555">+94 11 555 5555</a></div><div><span>Private viewings</span><p>Colombo, Sri Lanka<br />By appointment</p></div><p className="note">Our team usually responds within one business day.</p></aside><div><div className="form-tabs"><button className={mode === 'contact' ? 'active' : ''} onClick={() => setMode('contact')}>Send a message</button><button className={mode === 'stone' ? 'active' : ''} onClick={() => setMode('stone')}>Request a stone</button></div><form className="contact-form" onSubmit={submit}>{mode === 'contact' ? <><div className="field-grid"><label>Full name<input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} required /></label><label>Email address<input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} required /></label><label>Phone <em>Optional</em><input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></label><label>Subject<input value={contact.subject} onChange={(e) => setContact({ ...contact, subject: e.target.value })} required /></label></div><label>How can we help?<textarea rows="6" maxLength="5000" value={contact.message} onChange={(e) => setContact({ ...contact, message: e.target.value })} required /></label></> : <><div className="field-grid"><label>Full name<input value={stone.name} onChange={(e) => setStone({ ...stone, name: e.target.value })} required /></label><label>Email address<input type="email" value={stone.email} onChange={(e) => setStone({ ...stone, email: e.target.value })} required /></label><label>Gemstone type<input value={stone.gemstoneType} onChange={(e) => setStone({ ...stone, gemstoneType: e.target.value })} placeholder="Sapphire, Taaffeite…" required /></label><label>Weight<input value={stone.weight} onChange={(e) => setStone({ ...stone, weight: e.target.value })} placeholder="e.g. 3–5 carats" /></label><label>Dimensions<input value={stone.dimensions} onChange={(e) => setStone({ ...stone, dimensions: e.target.value })} /></label><label>Treatment<input value={stone.treatment} onChange={(e) => setStone({ ...stone, treatment: e.target.value })} /></label><label>Shape<input value={stone.shape} onChange={(e) => setStone({ ...stone, shape: e.target.value })} /></label><label>Colour<input value={stone.colour} onChange={(e) => setStone({ ...stone, colour: e.target.value })} /></label></div><label>Other details<textarea rows="5" value={stone.notes} onChange={(e) => setStone({ ...stone, notes: e.target.value })} /></label><p className="form-note">Availability varies. We will make every effort to source your requested stone and may present similar high-quality alternatives.</p></>}<button className="button">Submit {mode === 'stone' ? 'request' : 'message'}</button></form></div></section></div>;
}

const faqItems = [
  ['How to auction', 'Create an account, sign in, and open any live gemstone. Enter a valid amount, review the confirmation, and place your bid. Live prices update without refreshing.'],
  ['How to find a stone', 'Search by gemstone name, Product ID, colour, origin, or use the collection filters. If nothing matches, send a request and our team will source the closest available stone.'],
  ['How to request a stone', 'Use the Request a Stone form on the contact page. Include type, weight, dimensions, treatment, shape, and colour where possible.'],
  ['How to access the Private Collection', 'Sign in and submit a private access request. Access is granted to selected clients after review and a one-time membership fee may apply.'],
  ['How to become a vendor', 'Send a message through the contact page with “Vendor application” as the subject. Our team will review your experience and sourcing credentials.'],
  ['How to cancel bids', 'Bids are final to protect fairness and transparency. In exceptional circumstances, contact support immediately. Requests are reviewed case by case.'],
  ['Certification requests', 'Every listed gemstone is authenticated. Certification details appear on the stone page and the physical certificate travels with the completed purchase.'],
  ['Delivery', 'Winning stones are dispatched after payment verification using insured, trackable delivery. Timing and import charges depend on destination.']
];

function AssistancePage() {
  const [open, setOpen] = useState(0);
  return <div className="page-wrap"><PageHero eyebrow="Assistance" title="A clear answer at every step." text="Learn how bidding, private access, certification, and delivery work." /><section className="faq-layout"><aside><span className="eyebrow">Need more help?</span><h2>Speak with our team.</h2><p>If your question is not covered here, our gemstone concierge is ready to help.</p><Link className="button" to="/contact">Contact us</Link></aside><div className="accordion">{faqItems.map(([title, content], index) => <div className={open === index ? 'open' : ''} id={title.toLowerCase().includes('delivery') ? 'delivery' : title.toLowerCase().includes('cancel') ? 'cancel' : undefined} key={title}><button onClick={() => setOpen(open === index ? -1 : index)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{title}</strong><b>{open === index ? '−' : '+'}</b></button>{open === index && <p>{content}</p>}</div>)}</div></section></div>;
}

function SetupPage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ setupToken: '', name: '', email: '', password: '' });
  async function submit(event) { event.preventDefault(); try { const result = await api('/setup/admin', { method: 'POST', body: form }); setUser(result.user); toast({ type: 'success', message: 'Administrator created. Remove SETUP_TOKEN and restart the app.' }); navigate('/admin'); } catch (error) { toast({ type: 'error', message: error.message }); } }
  if (user?.role === 'admin') return <Navigate to="/admin" />;
  return <div className="center-page"><form className="form-card setup-card" onSubmit={submit}><span className="eyebrow">One-time setup</span><h1>Create the first administrator</h1><p>This only works while the database has no administrator. Use the token from your cPanel environment settings.</p><label>Setup token<input type="password" value={form.setupToken} onChange={(e) => setForm({ ...form, setupToken: e.target.value })} required /></label><label>Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label>Email address<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label><label>Password<input type="password" minLength="10" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label><button className="button full">Create administrator</button></form></div>;
}

function AdminPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [section, setSection] = useState('overview');
  const [categories, setCategories] = useState([]);
  const initialForm = { gemstone: { productCode: '', name: '', categoryId: '', description: '', story: '', weightCarats: '', dimensions: '', treatment: '', cutShape: '', colour: '', origin: '', certificationLab: '', primaryImage: '/assets/violet-taaffeite.jpg' }, auction: { type: 'standard', visibility: 'public', status: 'scheduled', startingPrice: '', reservePrice: '', buyNowPrice: '', minimumIncrement: '100', serviceFeePercent: '3.5', currency: 'USD', startsAt: '', endsAt: '', featured: false } };
  const [form, setForm] = useState(initialForm);
  async function load() { try { setData(await api('/admin/overview')); } catch (error) { toast({ type: 'error', message: error.message }); } }
  useEffect(() => { load(); api('/categories').then((r) => setCategories(r.categories)); }, []);
  async function updateAuction(id, changes) { try { await api(`/admin/auctions/${id}`, { method: 'PATCH', body: changes }); await load(); toast({ type: 'success', message: 'Auction updated.' }); } catch (error) { toast({ type: 'error', message: error.message }); } }
  async function updateUser(id, status) { try { await api(`/admin/users/${id}`, { method: 'PATCH', body: { status } }); await load(); } catch (error) { toast({ type: 'error', message: error.message }); } }
  async function reviewAccess(id, status) { try { await api(`/admin/private-access/${id}`, { method: 'PATCH', body: { status } }); await load(); toast({ type: 'success', message: `Access ${status}.` }); } catch (error) { toast({ type: 'error', message: error.message }); } }
  async function createAuction(event) { event.preventDefault(); try { const result = await api('/admin/auctions', { method: 'POST', body: form }); toast({ type: 'success', message: `Auction #${result.id} created.` }); setForm(initialForm); setSection('auctions'); await load(); } catch (error) { toast({ type: 'error', message: error.message }); } }
  async function uploadImage(event) { const file = event.target.files[0]; if (!file) return; const body = new FormData(); body.append('image', file); try { const result = await api('/admin/uploads', { method: 'POST', body }); setForm((current) => ({ ...current, gemstone: { ...current.gemstone, primaryImage: result.path } })); toast({ type: 'success', message: 'Image uploaded.' }); } catch (error) { toast({ type: 'error', message: error.message }); } }
  if (!data) return <PageLoader />;
  return <div className="admin"><aside className="admin-sidebar"><span className="brand-script">Taaffeite Origin</span><small>Administration</small>{[['overview','Overview'],['auctions','Auctions'],['create','Create auction'],['users','Bidders'],['access','Private access'],['security','Security']].map(([key, label]) => <button className={section === key ? 'active' : ''} onClick={() => setSection(key)} key={key}>{label}{key === 'access' && data.accessRequests.length ? <b>{data.accessRequests.length}</b> : null}</button>)}<a href="/api/admin/export/bids.csv">Export bids CSV ↗</a></aside><section className="admin-content">{section === 'overview' && <><AdminHeading title="Auction overview" text="A live view of platform activity and actions needing attention." /><div className="stats-grid">{[['Live auctions',data.stats.live_auctions],['Registered bidders',data.stats.bidders],['Total bids',data.stats.bids],['Paid revenue',money(data.stats.revenue)],['Pending orders',data.stats.pending_orders]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="admin-panel"><h2>Recent auctions</h2><AdminAuctionTable auctions={data.auctions.slice(0, 6)} updateAuction={updateAuction} /></div></>}{section === 'auctions' && <><AdminHeading title="Manage auctions" text="Click a listing to inspect bidders, live bids, timing, reserves, and the winning order." /><div className="admin-panel"><AdminAuctionTable auctions={data.auctions} updateAuction={updateAuction} /></div></>}{section === 'users' && <><AdminHeading title="Bidders" text="Restrict or ban accounts while preserving the audit trail." /><div className="admin-panel"><DataTable headers={['Bidder','Email','Joined','Private access','Status']}>{data.users.map((person) => <tr key={person.id}><td>{person.name}{person.role === 'admin' && <small> Administrator</small>}</td><td>{person.email}</td><td>{formatDate(person.created_at, false)}</td><td><span className="tag">{person.private_access}</span></td><td>{person.role === 'admin' ? 'Protected' : <select value={person.status} onChange={(e) => updateUser(person.id, e.target.value)}><option>active</option><option>restricted</option><option>banned</option></select>}</td></tr>)}</DataTable></div></>}{section === 'access' && <><AdminHeading title="Private access requests" text="Review collector details before opening the private collection." />{data.accessRequests.length ? <div className="request-grid">{data.accessRequests.map((request) => <div className="request-card" key={request.id}><span className="tag">Pending</span><h3>{request.name}</h3><a href={`mailto:${request.email}`}>{request.email}</a><dl><dt>Country</dt><dd>{request.country || 'Not provided'}</dd><dt>Occupation</dt><dd>{request.occupation || 'Not provided'}</dd><dt>Interest</dt><dd>{request.collection_interest || 'Not provided'}</dd></dl><div><button className="button small" onClick={() => reviewAccess(request.id, 'approved')}>Approve</button><button className="button ghost small" onClick={() => reviewAccess(request.id, 'declined')}>Decline</button></div></div>)}</div> : <EmptyState title="No requests waiting" text="New private access requests will appear here." />}</>}{section === 'security' && <><AdminHeading title="Security" text="Replace temporary or compromised administrator credentials." /><AdminSecurityPanel /></>}{section === 'create' && <><AdminHeading title="Create auction" text="Add the gemstone record and configure its auction in one step." /><form className="admin-form" onSubmit={createAuction}><fieldset><legend>Gemstone details</legend><div className="field-grid"><label>Product ID<input value={form.gemstone.productCode} onChange={(e) => setForm({ ...form, gemstone: { ...form.gemstone, productCode: e.target.value } })} required /></label><label>Display name<input value={form.gemstone.name} onChange={(e) => setForm({ ...form, gemstone: { ...form.gemstone, name: e.target.value } })} required /></label><label>Category<select value={form.gemstone.categoryId} onChange={(e) => setForm({ ...form, gemstone: { ...form.gemstone, categoryId: e.target.value } })}><option value="">Select</option>{categories.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Weight (carats)<input type="number" step="0.01" value={form.gemstone.weightCarats} onChange={(e) => setForm({ ...form, gemstone: { ...form.gemstone, weightCarats: e.target.value } })} /></label><label>Dimensions<input value={form.gemstone.dimensions} onChange={(e) => setForm({ ...form, gemstone: { ...form.gemstone, dimensions: e.target.value } })} /></label><label>Treatment<input value={form.gemstone.treatment} onChange={(e) => setForm({ ...form, gemstone: { ...form.gemstone, treatment: e.target.value } })} /></label><label>Shape<input value={form.gemstone.cutShape} onChange={(e) => setForm({ ...form, gemstone: { ...form.gemstone, cutShape: e.target.value } })} /></label><label>Colour<input value={form.gemstone.colour} onChange={(e) => setForm({ ...form, gemstone: { ...form.gemstone, colour: e.target.value } })} /></label><label>Origin<input value={form.gemstone.origin} onChange={(e) => setForm({ ...form, gemstone: { ...form.gemstone, origin: e.target.value } })} /></label><label>Certification lab<input value={form.gemstone.certificationLab} onChange={(e) => setForm({ ...form, gemstone: { ...form.gemstone, certificationLab: e.target.value } })} /></label><label className="wide">Primary image<input type="file" accept="image/*" onChange={uploadImage} /><small>{form.gemstone.primaryImage}</small></label><label className="wide">Description<textarea rows="3" value={form.gemstone.description} onChange={(e) => setForm({ ...form, gemstone: { ...form.gemstone, description: e.target.value } })} /></label><label className="wide">Origin story<textarea rows="5" value={form.gemstone.story} onChange={(e) => setForm({ ...form, gemstone: { ...form.gemstone, story: e.target.value } })} /></label></div></fieldset><fieldset><legend>Auction configuration</legend><div className="field-grid"><label>Auction type<select value={form.auction.type} onChange={(e) => setForm({ ...form, auction: { ...form.auction, type: e.target.value } })}><option value="standard">Standard — highest wins</option><option value="reverse">Reverse — lowest wins</option><option value="sealed">Private / sealed</option></select></label><label>Visibility<select value={form.auction.visibility} onChange={(e) => setForm({ ...form, auction: { ...form.auction, visibility: e.target.value } })}><option>public</option><option>private</option><option>hidden</option></select></label><label>Status<select value={form.auction.status} onChange={(e) => setForm({ ...form, auction: { ...form.auction, status: e.target.value } })}><option>draft</option><option>scheduled</option><option>live</option></select></label><label>Starting price<input type="number" value={form.auction.startingPrice} onChange={(e) => setForm({ ...form, auction: { ...form.auction, startingPrice: e.target.value } })} required /></label><label>Reserve price<input type="number" value={form.auction.reservePrice} onChange={(e) => setForm({ ...form, auction: { ...form.auction, reservePrice: e.target.value } })} /></label><label>Buy now price<input type="number" value={form.auction.buyNowPrice} onChange={(e) => setForm({ ...form, auction: { ...form.auction, buyNowPrice: e.target.value } })} /></label><label>Minimum increment<input type="number" value={form.auction.minimumIncrement} onChange={(e) => setForm({ ...form, auction: { ...form.auction, minimumIncrement: e.target.value } })} /></label><label>Service fee %<input type="number" step="0.1" value={form.auction.serviceFeePercent} onChange={(e) => setForm({ ...form, auction: { ...form.auction, serviceFeePercent: e.target.value } })} /></label><label>Start date and time<input type="datetime-local" value={form.auction.startsAt} onChange={(e) => setForm({ ...form, auction: { ...form.auction, startsAt: e.target.value } })} required /></label><label>End date and time<input type="datetime-local" value={form.auction.endsAt} onChange={(e) => setForm({ ...form, auction: { ...form.auction, endsAt: e.target.value } })} required /></label><label className="check-line wide"><input type="checkbox" checked={form.auction.featured} onChange={(e) => setForm({ ...form, auction: { ...form.auction, featured: e.target.checked } })} /> Feature this auction on the homepage</label></div></fieldset><button className="button">Create auction</button></form></>}</section></div>;
}

function AdminSecurityPanel() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  async function submit(event) {
    event.preventDefault();
    if (form.newPassword !== form.confirmPassword) return toast({ type: 'error', message: 'The new passwords do not match.' });
    try {
      await api('/auth/change-password', { method: 'POST', body: form });
      setUser({ ...user, must_reset_password: 0 });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast({ type: 'success', message: 'Administrator password changed.' });
    } catch (error) { toast({ type: 'error', message: error.message }); }
  }
  return <div className="admin-panel security-panel">{user.must_reset_password ? <div className="security-warning"><strong>Temporary password in use</strong><p>Change the imported administrator password before making this site public.</p></div> : <div className="security-ok">✓ Your temporary password has been replaced.</div>}<form className="form-card compact" onSubmit={submit}><label>Current password<input type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required /></label><label>New password<input type="password" minLength="10" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required /></label><label>Confirm new password<input type="password" minLength="10" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required /></label><button className="button">Change password</button></form></div>;
}

function AdminAuctionDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [updating, setUpdating] = useState(false);
  async function load(silent = false) {
    try { setData(await api(`/admin/auctions/${id}`)); }
    catch (error) { if (!silent) toast({ type: 'error', message: error.message }); }
  }
  useEffect(() => { load(); const timer = setInterval(() => load(true), 5000); return () => clearInterval(timer); }, [id]);
  async function update(changes, message = 'Auction updated.') {
    setUpdating(true);
    try { await api(`/admin/auctions/${id}`, { method: 'PATCH', body: changes }); await load(true); toast({ type: 'success', message }); }
    catch (error) { toast({ type: 'error', message: error.message }); }
    finally { setUpdating(false); }
  }
  function extend(minutes) {
    const base = Math.max(Date.now(), new Date(data.auction.ends_at).getTime());
    update({ endsAt: new Date(base + minutes * 60000).toISOString() }, `Auction extended by ${minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hours`}.`);
  }
  if (!data) return <PageLoader />;
  const { auction, bids, autoBids, order } = data;
  const leadingBid = bids.find((bid) => Boolean(bid.is_winning));
  return <div className="admin-detail-page"><div className="admin-detail-top"><Link to="/admin">← Back to auction manager</Link><div><a href={`/auction/${auction.id}`} target="_blank" rel="noreferrer">View public listing ↗</a><a href="/api/admin/export/bids.csv">Export bids CSV ↗</a></div></div><section className="admin-auction-hero"><img src={auction.primary_image} alt={auction.name} /><div><div className="admin-title-line"><span className={`tag ${auction.status === 'live' ? 'success' : ''}`}>{auction.status}</span><span className="tag">{auction.type}</span><span className="tag">{auction.visibility}</span></div><span className="eyebrow">{auction.category} · {auction.product_code} · Auction #{auction.id}</span><h1>{auction.name}</h1><p>{auction.description}</p><div className="admin-expiry"><span>{auction.status === 'scheduled' ? 'Starts in' : auction.status === 'live' ? 'Auction expires in' : 'Auction ended'}</span>{auction.status !== 'ended' && <Countdown date={auction.status === 'scheduled' ? auction.starts_at : auction.ends_at} />}<small>{auction.status === 'scheduled' ? `Starts ${formatDate(auction.starts_at)}` : `Closes ${formatDate(auction.ends_at)}`}</small></div></div></section><section className="admin-live-stats"><div><span>Current {auction.type === 'reverse' ? 'offer' : 'highest bid'}</span><strong>{money(auction.current_price, auction.currency, auction.currency)}</strong></div><div><span>Active leader</span><strong>{auction.leader_name || 'No bidder'}</strong><small>{auction.leader_email || 'Awaiting first bid'}</small></div><div><span>Total bids</span><strong>{auction.bid_count}</strong><small>{auction.unique_bidders} unique bidders</small></div><div><span>Reserve</span><strong>{auction.reserve_price ? money(auction.reserve_price, auction.currency, auction.currency) : 'None'}</strong><small className={auction.reserve_met ? 'met' : 'not-met'}>{auction.reserve_met ? 'Reserve met' : 'Reserve not met'}</small></div></section><section className="admin-control-panel"><div><h2>Auction controls</h2><p>Changes take effect immediately on the public listing.</p></div><label>Status<select disabled={updating} value={auction.status} onChange={(e) => update({ status: e.target.value })}><option>draft</option><option>scheduled</option><option>live</option><option>ended</option><option>cancelled</option></select></label><label>Visibility<select disabled={updating} value={auction.visibility} onChange={(e) => update({ visibility: e.target.value })}><option>public</option><option>private</option><option>hidden</option></select></label><div className="extend-controls"><span>Extend closing time</span><button disabled={updating} onClick={() => extend(15)}>+15 min</button><button disabled={updating} onClick={() => extend(60)}>+1 hour</button><button disabled={updating} onClick={() => extend(1440)}>+24 hours</button></div><button className={auction.featured ? 'button secondary' : 'button'} disabled={updating} onClick={() => update({ featured: !auction.featured })}>{auction.featured ? 'Remove feature' : 'Feature auction'}</button></section><section className="admin-bid-section"><div className="admin-section-heading"><div><span className="eyebrow">Live bidder activity</span><h2>Bids and bidder identities</h2><p>Updates automatically every five seconds. The leading bid remains active until it is outbid or the auction closes.</p></div><span className="live-monitor"><i /> Live monitor</span></div>{bids.length ? <DataTable headers={['State','Bidder','Contact','Bid amount','Method','Placed','Valid until']}>{bids.map((bid) => <tr className={bid.is_winning ? 'winning-row' : ''} key={bid.id}><td><span className={`tag ${bid.is_winning ? 'success' : ''}`}>{bid.bid_state}</span></td><td><strong>{bid.bidder_name}</strong><small>User #{bid.user_id} · {bid.bidder_status}</small></td><td><a href={`mailto:${bid.bidder_email}`}>{bid.bidder_email}</a><small>{bid.bidder_phone || 'No phone supplied'}</small></td><td className="bid-amount">{money(bid.amount, auction.currency, auction.currency)}</td><td><span className="tag">{bid.source}</span></td><td>{formatDate(bid.created_at)}</td><td>{bid.is_winning ? formatDate(auction.ends_at) : 'No longer active'}</td></tr>)}</DataTable> : <EmptyState title="No bids yet" text="Bidder details and amounts will appear here as soon as the auction receives a bid." />}</section><section className="admin-detail-grid"><div className="admin-panel"><h2>Automatic bid limits</h2><p className="muted">Only administrators can see bidder maximums.</p>{autoBids.length ? <DataTable headers={['Bidder','Maximum','Status','Updated']}>{autoBids.map((bid) => <tr key={bid.id}><td>{bid.bidder_name}<small>{bid.bidder_email}</small></td><td className="bid-amount">{money(bid.maximum_amount, auction.currency, auction.currency)}</td><td><span className={`tag ${bid.active ? 'success' : ''}`}>{bid.active ? 'Active' : 'Inactive'}</span></td><td>{formatDate(bid.updated_at)}</td></tr>)}</DataTable> : <p>No automatic bids are registered.</p>}</div><div className="admin-panel auction-facts"><h2>Auction configuration</h2>{[['Starting price', money(auction.starting_price, auction.currency, auction.currency)],['Minimum increment', money(auction.minimum_increment, auction.currency, auction.currency)],['Buy Now', auction.buy_now_price ? money(auction.buy_now_price, auction.currency, auction.currency) : 'Disabled'],['Entry fee', money(auction.entry_fee, auction.currency, auction.currency)],['Service fee', `${auction.service_fee_percent}%`],['Late-bid extension', `${auction.extension_minutes} minutes inside final ${auction.extension_window_minutes} minutes`],['Created', formatDate(auction.created_at)],['Last updated', formatDate(auction.updated_at)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>{leadingBid && <section className="leader-card"><div><span className="eyebrow">Current winning position</span><h2>{leadingBid.bidder_name}</h2><a href={`mailto:${leadingBid.bidder_email}`}>{leadingBid.bidder_email}</a><p>{leadingBid.bidder_phone || 'No phone number provided'}</p></div><div><span>Leading bid</span><strong>{money(leadingBid.amount, auction.currency, auction.currency)}</strong><small>Valid until {formatDate(auction.ends_at)}, unless outbid.</small></div></section>}{order && <section className="admin-panel order-outcome"><h2>Winning order</h2><div><span>{order.order_number}</span><strong>{money(order.total, order.currency, order.currency)}</strong><span className="tag">Payment: {order.payment_status}</span><span className="tag">Fulfillment: {order.fulfillment_status}</span><span>Due {formatDate(order.due_at)}</span></div></section>}</div>;
}

function AdminHeading({ title, text }) { return <div className="admin-heading"><div><span className="eyebrow">Administration</span><h1>{title}</h1><p>{text}</p></div><span>{formatDate(new Date())}</span></div>; }
function AdminAuctionTable({ auctions, updateAuction }) { return <DataTable headers={['Auction','Type','Price','Bids','Ends','Visibility','Status','Featured']}>{auctions.map((item) => <tr key={item.id}><td><Link className="admin-listing-link" to={`/admin/auctions/${item.id}`}>{item.name} <span>View →</span></Link><small>{item.product_code}</small></td><td>{item.type}</td><td>{money(item.current_price, item.currency)}</td><td>{item.bid_count}</td><td>{formatDate(item.ends_at)}</td><td><select value={item.visibility} onChange={(e) => updateAuction(item.id, { visibility: e.target.value })}><option>public</option><option>private</option><option>hidden</option></select></td><td><select value={item.status} onChange={(e) => updateAuction(item.id, { status: e.target.value })}><option>draft</option><option>scheduled</option><option>live</option><option>ended</option><option>cancelled</option></select></td><td><button className={item.featured ? 'feature-button active' : 'feature-button'} onClick={() => updateAuction(item.id, { featured: !item.featured })}>★</button></td></tr>)}</DataTable>; }

function PageHero({ eyebrow, title, text }) { return <section className="page-hero"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{text && <p>{text}</p>}</section>; }
function PageLoader() { return <div className="page-loader"><span /><p>Revealing the collection…</p></div>; }
function CardSkeletons() { return <div className="card-grid">{[1,2,3].map((i) => <div className="card-skeleton" key={i}><div /><span /><span /></div>)}</div>; }
function EmptyState({ title, text, action }) { return <div className="empty-state"><span>◇</span><h3>{title}</h3><p>{text}</p>{action}</div>; }
function ErrorPage({ title, text, action, success = false }) { return <div className={`error-page ${success ? 'success' : ''}`}><span>{success ? '✓' : '◇'}</span><h1>{title}</h1><p>{text}</p>{action || <Link to="/" className="button">Back home</Link>}</div>; }
function NotFoundPage() { return <ErrorPage title="This page is yet to be discovered" text="The page may have moved, or this particular stone is no longer available." />; }
function Modal({ children, onClose }) { return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(e) => e.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button>{children}</div></div>; }
function DataTable({ headers, children }) { return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }

export default App;
