'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PermissionRecord, ScanSuccess } from '@wps/contracts';
import {
  displayAmount,
  assessmentExplanations,
  signalExplanations,
  warningExplanations,
} from './explanations';
import {
  defaultFilters,
  selectRecords,
  type Filters,
  type Sort,
} from './selectors';
import { useScanner } from './use-scanner';

function RetryButton({
  until,
  children,
  onClick,
  submitForm = false,
}: {
  until: number;
  children: ReactNode;
  onClick?: () => void;
  submitForm?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  return (
    <button
      type={submitForm ? 'submit' : 'button'}
      className={submitForm ? 'button primary' : 'button secondary'}
      disabled={seconds > 0}
      onClick={(event) => {
        if (Date.now() < until) event.preventDefault();
        else if (!submitForm) onClick?.();
      }}
    >
      {seconds > 0 ? `Retry in ${seconds}s` : children}
    </button>
  );
}

export function Scanner() {
  const scanner = useScanner();
  const inputRef = useRef<HTMLInputElement>(null);
  const { scan, coverage } = scanner;
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [sort, setSort] = useState<Sort>({ key: 'risk', direction: 'desc' });
  const result = scan.result;
  const records = result
    ? selectRecords(result.permissions, filters, sort)
    : [];
  const status =
    scan.status === 'loading'
      ? 'Scanning configured pairs…'
      : scan.status === 'success'
        ? `${result?.status === 'partial' ? 'Partial scan' : 'Scan complete'}. ${result?.summary.active} active, ${result?.summary.inactive} inactive, ${result?.summary.unknown} unknown permissions in the configured set.`
        : scan.status === 'error'
          ? scan.error?.message
          : 'Ready for a public address. No scan has run.';

  function submit() {
    const accepted = scanner.submit();
    if (accepted === false) inputRef.current?.focus();
    if (accepted === true) {
      setFilters(defaultFilters);
      setSort({ key: 'risk', direction: 'desc' });
    }
  }

  return (
    <>
      <section id="scan" className="scanner-section">
        <div className="section-intro">
          <div>
            <p className="eyebrow">Public address / read only</p>
            <h2>See what can spend.</h2>
          </div>
          <p>
            Inspect current ERC-20 allowances for supported token and spender
            pairs. A public address is all you need.
          </p>
        </div>
        <form
          action="/api/v1/scans"
          method="post"
          noValidate
          aria-label="Scan a public address"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="wallet-address">
            Ethereum wallet address <span className="muted">(required)</span>
          </label>
          <p id="address-hint" className="field-hint">
            A 0x address. Ethereum mainnet only. No wallet connection.
          </p>
          <div className="address-controls">
            <input
              ref={inputRef}
              id="wallet-address"
              name="address"
              type="text"
              required
              maxLength={128}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="go"
              placeholder="0x…"
              value={scanner.input}
              aria-invalid={Boolean(scanner.validation)}
              aria-describedby={
                scanner.validation
                  ? 'address-hint address-error'
                  : 'address-hint'
              }
              onChange={(event) => scanner.edit(event.target.value)}
            />
            {scan.status === 'error' && scan.retryAt > 0 ? (
              <RetryButton until={scan.retryAt} submitForm>
                Scan address <span aria-hidden="true">↗</span>
              </RetryButton>
            ) : (
              <button
                className="button primary"
                type="submit"
                disabled={scan.status === 'loading'}
              >
                {scan.status === 'loading' ? 'Scanning…' : 'Scan address'}
                <span aria-hidden="true">↗</span>
              </button>
            )}
          </div>
          {scanner.validation ? (
            <p id="address-error" className="validation">
              {scanner.validation}
            </p>
          ) : null}
          <div className="form-footer">
            <p>Addresses and results stay in memory for this page.</p>
            {scan.status === 'loading' ? (
              <button
                className="text-button"
                type="button"
                onClick={scanner.cancel}
              >
                Cancel scan
              </button>
            ) : null}
          </div>
        </form>
        {coverage.data?.source === 'demo' ? (
          <p className="field-hint">
            Demo service: scans return synthetic examples, not live
            observations.
          </p>
        ) : null}
        <p className="scan-status" role="status" aria-live="polite">
          {scanner.validation ?? status}
        </p>
        {scan.status === 'loading' ? (
          <progress aria-label="Scanning configured pairs" />
        ) : null}
        {scan.status === 'error' && scan.error ? (
          <div className="notice">
            <h3>Scan unavailable</h3>
            <p>{scan.error.message}</p>
            {scan.error.requestId ? (
              <p className="technical">Request ID: {scan.error.requestId}</p>
            ) : null}
            <p>No permission results are available for this request.</p>
          </div>
        ) : null}
      </section>

      {result ? (
        <section id="results" className="results-section">
          <div className="section-intro">
            <div>
              <p className="eyebrow">
                {result.source === 'demo'
                  ? 'Synthetic demo / not a live observation'
                  : 'Live reads / finalized snapshot'}
              </p>
              <h2>
                {result.status === 'partial'
                  ? 'An incomplete view.'
                  : 'Your permission view.'}
              </h2>
            </div>
            <p>
              Exposure describes the breadth of a permission under policy{' '}
              {result.riskPolicyVersion}. It does not establish whether a
              contract is safe or malicious.
            </p>
          </div>
          <div className="result-wallet">
            <span className="eyebrow">Scanned address</span>
            <code>{result.walletAddress}</code>
          </div>
          {result.source === 'demo' ? (
            <p className="notice">
              Synthetic demo: addresses, amounts and block data are examples. No
              live blockchain reads were made. Explorer navigation is disabled.
            </p>
          ) : null}
          <dl className="stats">
            <div>
              <dt>Active permissions</dt>
              <dd>{result.summary.active}</dd>
            </div>
            <div>
              <dt>Inactive permissions</dt>
              <dd>{result.summary.inactive}</dd>
            </div>
            <div>
              <dt>Unknown permissions</dt>
              <dd>{result.summary.unknown}</dd>
            </div>
            <div>
              <dt>Pairs checked</dt>
              <dd>
                {result.coverage.checkedPairs}
                <span> / {result.coverage.configuredPairs}</span>
              </dd>
            </div>
          </dl>
          {result.status === 'partial' ? (
            <p className="notice">
              Some fields could not be read. Unknown readings are not inactive
              permissions. Review field warnings below; this scan cannot
              establish that there are no active permissions.
            </p>
          ) : result.summary.active === 0 ? (
            <p className="notice">
              No active permissions were found in the configured set at this
              snapshot. Inactive records remain below. Other permissions may
              exist.
            </p>
          ) : null}
          <Snapshot result={result} />
          <search className="filters" aria-label="Filter permission results">
            <fieldset>
              <legend>Filter permissions</legend>
              <Select
                id="filter-token"
                label="Token address"
                value={filters.token}
                onChange={(token) => setFilters({ ...filters, token })}
              >
                <option value="">All tokens</option>
                {[...new Set(result.permissions.map((p) => p.token.address))]
                  .sort()
                  .map((address) => (
                    <option key={address} value={address}>
                      {address}
                    </option>
                  ))}
              </Select>
              <Select
                id="filter-spender"
                label="Spender address"
                value={filters.spender}
                onChange={(spender) => setFilters({ ...filters, spender })}
              >
                <option value="">All spenders</option>
                {[...new Set(result.permissions.map((p) => p.spender.address))]
                  .sort()
                  .map((address) => (
                    <option key={address} value={address}>
                      {address}
                    </option>
                  ))}
              </Select>
              <Select
                id="filter-activity"
                label="Activity"
                value={filters.activity}
                onChange={(activity) =>
                  setFilters({
                    ...filters,
                    activity: activity as Filters['activity'],
                  })
                }
              >
                {['all', 'active', 'inactive', 'unknown'].map((value) => (
                  <option key={value} value={value}>
                    {value === 'all' ? 'All activity' : value}
                  </option>
                ))}
              </Select>
              <Select
                id="filter-risk"
                label="Exposure level"
                value={filters.risk}
                onChange={(risk) =>
                  setFilters({ ...filters, risk: risk as Filters['risk'] })
                }
              >
                {['all', 'high', 'medium', 'low', 'none', 'unknown'].map(
                  (value) => (
                    <option key={value} value={value}>
                      {value === 'all' ? 'All levels' : value}
                    </option>
                  ),
                )}
              </Select>
              <Select
                id="sort-key"
                label="Sort by"
                value={sort.key}
                onChange={(key) =>
                  setSort({ ...sort, key: key as Sort['key'] })
                }
              >
                <option value="risk">Exposure level</option>
                <option value="token">Token address</option>
                <option value="spender">Spender address</option>
              </Select>
              <Select
                id="sort-direction"
                label="Sort direction"
                value={sort.direction}
                onChange={(direction) =>
                  setSort({
                    ...sort,
                    direction: direction as Sort['direction'],
                  })
                }
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </Select>
            </fieldset>
            <div className="filter-footer">
              <p role="status">
                Showing {records.length} of {result.permissions.length}{' '}
                permissions
              </p>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setFilters(defaultFilters);
                  setSort({ key: 'risk', direction: 'desc' });
                }}
              >
                Reset filters
              </button>
            </div>
          </search>
          <p className="field-hint">
            Unknown exposure means unavailable, not safer. Amounts are exact and
            are not compared across assets.
          </p>
          {records.length === 0 ? (
            <div className="notice">
              <h3>No matching permissions</h3>
              <p>
                No records match all selected filters. Reset filters to inspect
                every returned record.
              </p>
            </div>
          ) : (
            <ul className="permission-list" role="list">
              {records.map((record) => (
                <li key={record.id}>
                  <Permission record={record} result={result} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section id="coverage" className="coverage-section">
        <div className="section-intro">
          <div>
            <p className="eyebrow">Know the boundaries</p>
            <h2>Coverage, made explicit.</h2>
          </div>
          <p>
            A complete scan checks the configured set. It does not discover
            every approval or assess the safety of a wallet.
          </p>
        </div>
        {coverage.status === 'loading' ? (
          <p role="status">Loading supported coverage…</p>
        ) : coverage.status === 'error' ? (
          <div className="notice">
            <h3>Coverage unavailable</h3>
            <p>{coverage.error?.message}</p>
            {coverage.error?.requestId ? (
              <p className="technical">
                Request ID: {coverage.error.requestId}
              </p>
            ) : null}
            <RetryButton
              until={coverage.error?.retryAt ?? 0}
              onClick={() => void scanner.refreshCoverage()}
            >
              Retry coverage
            </RetryButton>
            <p>
              You can still scan; a successful scan carries its own
              authoritative coverage.
            </p>
          </div>
        ) : null}
        {coverage.data ? (
          <>
            <p>
              {coverage.data.configuredPairs} configured pairs · Ethereum
              mainnet (chain ID 1) ·{' '}
              {coverage.data.source === 'demo'
                ? 'Synthetic demo coverage'
                : 'Live registry'}
            </p>
            <p className="muted">{coverage.data.limitation}</p>
            <p className="technical">
              Registry {coverage.data.registryVersion} / Policy{' '}
              {coverage.data.riskPolicyVersion}
            </p>
            <details>
              <summary>View configured token and spender addresses</summary>
              <ul className="coverage-list">
                {coverage.data.pairs.map((pair) => (
                  <li key={pair.id}>
                    <span>Token</span>
                    <code>{pair.tokenAddress}</code>
                    <span>
                      Spender
                      {pair.spender.label ? ` / ${pair.spender.label}` : ''}
                    </span>
                    <code>{pair.spender.address}</code>
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : null}
        {result &&
        coverage.data &&
        (result.registryVersion !== coverage.data.registryVersion ||
          result.source !== coverage.data.source) ? (
          <p className="notice">
            Current coverage differs from the displayed scan. The scan retains
            its original registry, source and metadata. Scan again deliberately
            to use current coverage.
          </p>
        ) : null}
      </section>
    </>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="select-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        name={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </div>
  );
}

function Snapshot({ result }: { result: ScanSuccess }) {
  return (
    <details className="snapshot">
      <summary>Snapshot & scan details</summary>
      <dl className="detail-grid">
        <div>
          <dt>
            {result.source === 'demo' ? 'Synthetic block' : 'Finalized block'}
          </dt>
          <dd>{result.snapshot.blockNumber}</dd>
        </div>
        <div>
          <dt>Block time (UTC)</dt>
          <dd>
            <time dateTime={result.snapshot.blockTimestamp}>
              {result.snapshot.blockTimestamp}
            </time>
          </dd>
        </div>
        <div>
          <dt>Scan completed (UTC)</dt>
          <dd>
            <time dateTime={result.completedAt}>{result.completedAt}</time>
          </dd>
        </div>
        <div>
          <dt>Versions</dt>
          <dd>
            {result.registryVersion} / {result.riskPolicyVersion}
          </dd>
        </div>
        <div className="wide">
          <dt>Block hash</dt>
          <dd>
            <code>{result.snapshot.blockHash}</code>
          </dd>
        </div>
        <div className="wide">
          <dt>Coverage</dt>
          <dd>
            {result.coverage.limitation} {result.coverage.failedPairs}{' '}
            unreadable allowance(s).
          </dd>
        </div>
        <div className="wide">
          <dt>Request ID</dt>
          <dd>{result.requestId}</dd>
        </div>
      </dl>
      <p className="field-hint">
        These values describe the stated block, not the present moment or the
        date an approval was granted. Compare its UTC block time with the
        current time before relying on it.
      </p>
    </details>
  );
}

function Address({
  address,
  kind,
  demo,
}: {
  address: string;
  kind: 'token' | 'address';
  demo: boolean;
}) {
  return demo ? (
    <code>{address}</code>
  ) : (
    <a
      className="address-link"
      href={`https://etherscan.io/${kind}/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
    >
      <code>{address}</code>
      <span className="sr-only"> on Etherscan (opens in a new tab)</span>
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}

function Permission({
  record,
  result,
}: {
  record: PermissionRecord;
  result: ScanSuccess;
}) {
  const warnings = result.warnings.filter(
    (warning) => warning.pairId === record.id,
  );
  return (
    <article className="permission">
      <header className="permission-header">
        <div>
          <p className="eyebrow">{record.activity} permission</p>
          <h3>
            {record.token.symbol ?? 'Symbol unavailable'}{' '}
            <span className="muted">
              / {record.spender.label ?? 'Unverified spender'}
            </span>
          </h3>
          <p className="muted">
            {record.token.name ?? 'Token name unavailable'}
          </p>
        </div>
        <span className={`risk-tag risk-${record.risk.level}`}>
          {record.risk.level} exposure
        </span>
      </header>
      <dl className="detail-grid">
        <div>
          <dt>Token address</dt>
          <dd>
            <Address
              address={record.token.address}
              kind="token"
              demo={result.source === 'demo'}
            />
          </dd>
        </div>
        <div>
          <dt>Spender address</dt>
          <dd>
            <Address
              address={record.spender.address}
              kind="address"
              demo={result.source === 'demo'}
            />
          </dd>
        </div>
        <div>
          <dt>Current allowance</dt>
          <dd className="amount">{displayAmount(record.allowance)}</dd>
          <dd className="technical">
            Raw: {record.allowance?.raw ?? 'unknown'}
          </dd>
        </div>
        <div>
          <dt>Token balance</dt>
          <dd className="amount">{displayAmount(record.balance)}</dd>
          <dd className="technical">Raw: {record.balance?.raw ?? 'unknown'}</dd>
        </div>
        <div>
          <dt>Token decimals</dt>
          <dd>{record.token.decimals ?? 'Unknown — no assumed decimals'}</dd>
        </div>
        <div>
          <dt>Spender identity</dt>
          <dd>
            {record.spender.identity === 'verified'
              ? `Verified mapping, reviewed ${record.spender.identityReviewedAt}`
              : 'Unverified mapping'}
          </dd>
          {record.spender.identitySourceUrl && result.source === 'live' ? (
            <dd>
              <a
                href={record.spender.identitySourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                Identity source{' '}
                <span className="sr-only">
                  for {record.spender.address} (opens in a new tab)
                </span>
                <span aria-hidden="true">↗</span>
              </a>
            </dd>
          ) : null}
        </div>
      </dl>
      <details>
        <summary>
          Why this exposure level? · {record.risk.assessment} assessment
        </summary>
        <p>{assessmentExplanations[record.risk.assessment]}</p>
        {record.risk.signals.length ? (
          <ul className="explanations">
            {record.risk.signals.map((signal) => (
              <li key={signal.code}>
                <strong>
                  {signal.code.replaceAll('_', ' ').toLowerCase()}
                </strong>
                <p>{signalExplanations[signal.code]}</p>
                {'allowanceRaw' in signal.parameters ? (
                  <p className="technical">
                    Allowance raw: {signal.parameters.allowanceRaw}
                    {'balanceRaw' in signal.parameters
                      ? ` / Balance raw: ${signal.parameters.balanceRaw}`
                      : ''}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            Allowance is zero at this snapshot; this record has no active
            spending permission. This does not certify the wallet or contract as
            safe.
          </p>
        )}
        <p>
          Verified identity is an address-to-name mapping, not a safety
          endorsement, and does not reduce exposure.
        </p>
      </details>
      {warnings.length ? (
        <div className="field-warnings">
          <h4>Unavailable fields</h4>
          <ul>
            {warnings.map((warning) => (
              <li key={warning.field}>
                <strong>{warning.field}</strong>:{' '}
                {warningExplanations[warning.code]}{' '}
                <span className="technical">({warning.code})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
