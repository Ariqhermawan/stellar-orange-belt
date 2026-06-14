import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  connectWallet,
  getWalletNetwork,
  disconnectWallet,
  describeWalletError,
} from "./lib/wallet";
import {
  CROWDFUND_ID,
  TOKEN_ID,
  getCampaign,
  getMyPledge,
  getTokenBalance,
  faucet,
  contribute,
  claim,
  refund,
  getRecentEvents,
  explorerContract,
  explorerTx,
  explorerAccount,
  describeError,
  type Campaign,
  type CrowdfundEvent,
  type WriteStage,
} from "./lib/crowdfund";
import { shortAddress, timeLeft } from "./lib/format";
import { Progress } from "./components/Progress";

type Tx =
  | { kind: "idle" }
  | { kind: "pending"; msg: string }
  | { kind: "success"; msg: string; hash: string }
  | { kind: "error"; msg: string };

const STAGE: Record<WriteStage, string> = {
  building: "Building transaction…",
  signing: "Waiting for wallet signature…",
  sending: "Submitting to the network…",
  confirming: "Waiting for confirmation…",
};

const STATUS_LABEL: Record<string, string> = {
  running: "Running",
  success: "Funded",
  expired: "Ended",
};

export default function App() {
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [pledge, setPledge] = useState(0);
  const [events, setEvents] = useState<CrowdfundEvent[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState("100");
  const [tx, setTx] = useState<Tx>({ kind: "idle" });
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const refreshCampaign = useCallback(async () => {
    try {
      setCampaign(await getCampaign());
    } catch (err) {
      console.error(err);
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    try {
      setEvents(await getRecentEvents());
    } catch (err) {
      console.error(err);
    }
  }, []);

  const refreshUser = useCallback(async (a: string) => {
    try {
      const [b, p] = await Promise.all([getTokenBalance(a), getMyPledge(a)]);
      setBalance(b);
      setPledge(p);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const refreshAll = useCallback(
    async (a: string | null) => {
      await Promise.all([
        refreshCampaign(),
        refreshEvents(),
        a ? refreshUser(a) : Promise.resolve(),
      ]);
    },
    [refreshCampaign, refreshEvents, refreshUser],
  );

  // Public campaign + events load immediately, no wallet needed.
  useEffect(() => {
    void refreshCampaign();
    void refreshEvents();
  }, [refreshCampaign, refreshEvents]);

  const handleConnect = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const a = await connectWallet();
      if (a) {
        setAddress(a);
        setNetwork(await getWalletNetwork());
        await refreshUser(a);
      }
    } catch (err) {
      setConnectError(describeWalletError(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (tx.kind === "pending") return; // don't disconnect mid-transaction
    try {
      await disconnectWallet();
    } catch {
      /* ignore */
    }
    setAddress(null);
    setNetwork(null);
    setBalance(null);
    setPledge(0);
    setTx({ kind: "idle" });
  };

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error(err);
    }
  };

  const onStage = (stage: WriteStage) => setTx({ kind: "pending", msg: STAGE[stage] });

  const runWrite = async (label: string, fn: () => Promise<string>) => {
    const addr = address; // pin the signer for the post-write refresh
    setTx({ kind: "pending", msg: `${label}…` });
    try {
      const hash = await fn();
      setTx({ kind: "success", msg: `${label} confirmed.`, hash });
      await refreshAll(addr);
    } catch (err) {
      setTx({ kind: "error", msg: describeError(err) });
    }
  };

  const onTestnet = network === "TESTNET";
  const isRecipient = !!address && !!campaign && address === campaign.recipient;
  const amountNum = Number(amount);
  const amountOk = Number.isInteger(amountNum) && amountNum > 0;
  const busy = tx.kind === "pending";

  const canFaucet = !!address && onTestnet && !busy;
  const canContribute =
    !!address &&
    onTestnet &&
    campaign?.status === "running" &&
    amountOk &&
    (balance ?? 0) >= amountNum &&
    !busy;
  const canClaim =
    isRecipient && campaign?.status === "success" && !campaign.claimed && !busy;
  const canRefund = !!address && campaign?.status === "expired" && pledge > 0 && !busy;

  const handleFaucet = () => {
    if (!address || !canFaucet) return;
    void runWrite("Faucet", () => faucet(address, onStage));
  };
  const handleContribute = (e: FormEvent) => {
    e.preventDefault();
    if (!address || !canContribute) return;
    void runWrite("Contribution", () => contribute(address, amountNum, onStage));
  };
  const handleClaim = () => {
    if (!address || !canClaim) return;
    void runWrite("Claim", () => claim(address, onStage));
  };
  const handleRefund = () => {
    if (!address || !canRefund) return;
    void runWrite("Refund", () => refund(address, onStage));
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/star.svg" alt="" width={22} height={22} />
          <span>Stellar Fund</span>
        </div>
        <span className="chip">Testnet · Soroban</span>
      </header>

      <main className="main">
        <div className="grid">
          <section className="card">
            <div className="row between">
              <h2>Community Fund</h2>
              {campaign && (
                <span className={`badge badge-${campaign.status}`}>
                  {STATUS_LABEL[campaign.status]}
                </span>
              )}
            </div>
            {campaign ? (
              <>
                <p className="amount">
                  {campaign.raised.toLocaleString("en-US")}
                  <span className="unit"> / {campaign.goal.toLocaleString("en-US")} PLG</span>
                </p>
                <Progress raised={campaign.raised} goal={campaign.goal} />
                <div className="row gap meta">
                  <span>{timeLeft(campaign.deadline, nowSec)}</span>
                  <a
                    className="link"
                    href={explorerContract(CROWDFUND_ID)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Contract {"↗"}
                  </a>
                  <a
                    className="link"
                    href={explorerAccount(campaign.recipient)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Recipient {shortAddress(campaign.recipient)} {"↗"}
                  </a>
                </div>
              </>
            ) : (
              <p className="muted">Loading campaign…</p>
            )}
          </section>

          {!address ? (
            <section className="card hero">
              <h1>Back a Soroban crowdfund</h1>
              <p className="muted">
                Connect a wallet, grab demo PLEDGE tokens, and contribute on-chain. Each
                contribution moves tokens through a cross-contract call.
              </p>
              <button className="btn primary" onClick={handleConnect} disabled={connecting}>
                {connecting ? "Connecting…" : "Connect Wallet"}
              </button>
              {connectError && (
                <p className="alert error" role="alert">
                  {connectError}
                </p>
              )}
              <p className="hint muted">
                Multi-wallet via Stellar Wallets Kit. Set your wallet to Testnet.
              </p>
            </section>
          ) : (
            <section className="card">
              <div className="row between">
                <h2>Account</h2>
                <button className="btn ghost sm" onClick={handleDisconnect} disabled={busy}>
                  Disconnect
                </button>
              </div>
              <div className="addr">
                <code title={address}>{shortAddress(address)}</code>
                <button
                  className="btn ghost sm"
                  onClick={handleCopy}
                  aria-label={`Copy address ${address}`}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="row gap">
                <span className={`net ${onTestnet ? "ok" : "warn"}`}>
                  {network ? `Network: ${network}` : "Network: unknown"}
                </span>
                <span className="bal">
                  Balance:{" "}
                  <strong>
                    {balance === null ? "…" : balance.toLocaleString("en-US")} PLG
                  </strong>
                </span>
              </div>
              {!onTestnet && (
                <p className="alert warn" role="alert">
                  Switch your wallet to <strong>Testnet</strong>.
                </p>
              )}
              <button className="btn ghost sm faucet" onClick={handleFaucet} disabled={!canFaucet}>
                Get 1,000 test PLEDGE
              </button>
            </section>
          )}

          {address && campaign?.status === "running" && (
            <section className="card">
              <h2>Contribute</h2>
              <form onSubmit={handleContribute}>
                <label className="amount-input">
                  Amount (PLG)
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <button className="btn primary" type="submit" disabled={!canContribute}>
                  {busy ? "Working…" : "Contribute"}
                </button>
              </form>
              {pledge > 0 && (
                <p className="hint muted">You have pledged {pledge.toLocaleString("en-US")} PLG.</p>
              )}
            </section>
          )}

          {canClaim && (
            <section className="card">
              <h2>Claim</h2>
              <p className="muted">The goal was met. As the recipient you can withdraw the pot.</p>
              <button className="btn primary" onClick={handleClaim} disabled={!canClaim}>
                Claim {campaign?.raised.toLocaleString("en-US")} PLG
              </button>
            </section>
          )}

          {canRefund && (
            <section className="card">
              <h2>Refund</h2>
              <p className="muted">The campaign ended without meeting its goal. Reclaim your pledge.</p>
              <button className="btn primary" onClick={handleRefund} disabled={!canRefund}>
                Refund {pledge.toLocaleString("en-US")} PLG
              </button>
            </section>
          )}

          {address && (
            <div aria-live="polite" aria-atomic="true">
              {tx.kind === "pending" && <p className="alert info">{tx.msg}</p>}
              {tx.kind === "error" && (
                <p className="alert error" role="alert">
                  {tx.msg}
                </p>
              )}
              {tx.kind === "success" && (
                <div className="alert success">
                  <p>{tx.msg}</p>
                  <a
                    className="link"
                    href={explorerTx(tx.hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View transaction {"↗"}
                  </a>
                </div>
              )}
            </div>
          )}

          <section className="card">
            <div className="row between">
              <h2>Recent activity</h2>
              <button className="btn ghost sm" onClick={refreshEvents} aria-label="Refresh activity">
                Refresh
              </button>
            </div>
            {events.length === 0 ? (
              <p className="muted">No activity yet.</p>
            ) : (
              <ul className="events">
                {events.map((ev) => (
                  <li key={ev.id} className="event">
                    <span className={`tag tag-${ev.topic}`}>{ev.topic}</span>
                    <span className="event-val">{ev.amount.toLocaleString("en-US")} PLG</span>
                    <a
                      className="link sm"
                      href={explorerTx(ev.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      tx {"↗"}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <footer className="footer muted">
        <span>Stellar Testnet · Soroban · funds have no real value</span>
        <a href={explorerContract(TOKEN_ID)} target="_blank" rel="noopener noreferrer">
          PLEDGE token {"↗"}
        </a>
      </footer>
    </div>
  );
}
