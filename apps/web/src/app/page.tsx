import { Scanner } from '../features/scanner/scanner';

export default function HomePage() {
  return (
    <>
      <a href="#main-heading" className="skip-link">
        Skip to scanner
      </a>
      <aside className="sidebar">
        <a href="#main-heading" className="brand">
          <span className="brand-mark" aria-hidden="true">
            w<span>↗</span>
          </span>
          <span>
            Wallet
            <br />
            Permission
            <br />
            Scanner
          </span>
        </a>
        <nav aria-label="Main">
          <a href="#scan">
            Scan address <span aria-hidden="true">↗</span>
          </a>
          <a href="#coverage">
            Coverage <span aria-hidden="true">↗</span>
          </a>
          <a href="#how-it-works">
            How it works <span aria-hidden="true">↗</span>
          </a>
        </nav>
        <div className="sidebar-note">
          <p className="eyebrow">Read only by design</p>
          <p>
            Your address.
            <br />
            Your permissions.
            <br />A clearer view.
          </p>
          <p className="muted">
            No connection.
            <br />
            No signatures.
            <br />
            No transactions.
          </p>
        </div>
      </aside>
      <main className="main-content">
        <header className="hero">
          <div className="topline">
            <span className="eyebrow">Ethereum mainnet</span>
            <span className="eyebrow">Chain 01 / ERC-20</span>
          </div>
          <h1 id="main-heading" tabIndex={-1}>
            Permissions
            <br />
            in plain sight.
          </h1>
          <div className="hero-bottom">
            <p>
              Understand the spending permissions
              <br className="desktop-break" /> attached to a public wallet
              address.
            </p>
            <div className="line-art" aria-hidden="true">
              {Array.from({ length: 28 }, (_, i) => (
                <span key={i} />
              ))}
            </div>
          </div>
        </header>
        <Scanner />
        <section id="how-it-works" className="how-section">
          <div className="section-intro">
            <div>
              <p className="eyebrow">Before you scan</p>
              <h2>A view, with limits.</h2>
            </div>
            <p>
              Permission exposure is a heuristic. A broad allowance does not
              prove malicious intent, and a small allowance does not prove
              safety.
            </p>
          </div>
          <div className="principles">
            <div>
              <h3>Current allowances</h3>
              <p>
                Live scans re-read supported allowances and balances at one
                finalized Ethereum block. Only configured token/spender pairs
                are checked; other permissions may exist.
              </p>
            </div>
            <div>
              <h3>Explainable exposure</h3>
              <p>
                Levels describe allowance breadth and its relation to token
                balance. Unknown data stays unknown. Verified identity is not a
                safety endorsement.
              </p>
            </div>
            <div>
              <h3>Public data, private context</h3>
              <p>
                Live scans send the address to the service and its configured
                RPC provider. Results are kept in page memory, with no
                persistent scan history or analytics. Explorer links contact
                Etherscan.
              </p>
            </div>
          </div>
        </section>
        <footer className="page-footer">
          <span>Wallet Permission Scanner</span>
          <span>Read only. Limited coverage. No safety guarantees.</span>
        </footer>
      </main>
    </>
  );
}
