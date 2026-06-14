// Multi-wallet connection via Stellar Wallets Kit (v2.x static API).
// Supports Freighter (default), xBull, Albedo, Rabet, Lobstr, Hana, and more.
// The kit keeps the secret key in the wallet; this app only ever sees signed XDR.

import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { FREIGHTER_ID } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";

// The enum value IS the network passphrase string.
export const NETWORK_PASSPHRASE: string = Networks.TESTNET;

let initialized = false;

function ensureInit(): void {
  if (initialized) return;
  StellarWalletsKit.init({
    modules: defaultModules(),
    selectedWalletId: FREIGHTER_ID,
    network: Networks.TESTNET,
  });
  initialized = true;
}

/** Open the multi-wallet picker modal. Returns the chosen address, or null if cancelled. */
export async function connectWallet(): Promise<string | null> {
  ensureInit();
  try {
    const { address } = await StellarWalletsKit.authModal();
    return address || null;
  } catch (err) {
    // User closed the modal or rejected the connection.
    console.warn("Wallet connection cancelled:", err);
    return null;
  }
}

/** The network the selected wallet reports, e.g. "TESTNET". Null if unknown. */
export async function getWalletNetwork(): Promise<string | null> {
  ensureInit();
  try {
    const { network } = await StellarWalletsKit.getNetwork();
    return network || null;
  } catch {
    return null;
  }
}

/** Ask the connected wallet to sign a transaction XDR; returns the signed XDR. */
export async function signXdr(xdr: string, address: string): Promise<string> {
  ensureInit();
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address,
  });
  return signedTxXdr;
}

/** Clear the kit's connection state. */
export async function disconnectWallet(): Promise<void> {
  ensureInit();
  await StellarWalletsKit.disconnect();
}

/** Turn an unknown wallet error into a readable message. */
export function describeWalletError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes("reject") || msg.includes("denied") || msg.includes("declined")) {
    return "You rejected the request in your wallet.";
  }
  if (msg.includes("not installed") || msg.includes("not available") || msg.includes("not found")) {
    return "Wallet not found. Install a Stellar wallet (e.g. Freighter) and set it to Testnet.";
  }
  return err instanceof Error ? err.message : "Wallet error.";
}
