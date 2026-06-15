// Chain logic for the crowdfund dApp: reads via simulation (no fee), writes via
// prepare -> wallet sign -> submit -> poll. `contribute` is a cross-contract call
// (crowdfund -> token.transfer); the contributor's single signature authorizes both.

import {
  rpc,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE, signXdr, describeWalletError } from "./wallet";

export const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
export const CROWDFUND_ID = "CB6HO45ESN7WPOB3WNQNYYM7OHTV6UDWWCQRS7TLSIADHBZD4AC4DS7V";
export const TOKEN_ID = "CAMI57EGDROSD4OD2RAMLGZUFYWCWWGPSCCBFHSH23L63HTRFJWLFHFR";

// A funded account used only as the source for read-only simulations (no fee,
// no state change). Reads work before the user connects a wallet.
const READ_SOURCE = "GDDEFEHHPEDTLRT2STBHBUYUT57X67WH4DSV67OZJKP2XO24G2XZQJI2";

const server = new rpc.Server(SOROBAN_RPC_URL);

export function explorerTx(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}
export function explorerContract(id: string): string {
  return `https://stellar.expert/explorer/testnet/contract/${id}`;
}
export function explorerAccount(address: string): string {
  return `https://stellar.expert/explorer/testnet/account/${address}`;
}

type ScArg = ReturnType<typeof nativeToScVal>;

/** Read a contract method via simulation only. Returns the decoded value. */
async function read(contractId: string, method: string, args: ScArg[] = []): Promise<unknown> {
  const account = await server.getAccount(READ_SOURCE);
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error("No value returned from the contract.");
  }
  return scValToNative(sim.result.retval);
}

const addr = (a: string): ScArg => nativeToScVal(a, { type: "address" });
const i128 = (n: number): ScArg => nativeToScVal(n, { type: "i128" });

export type Status = "running" | "success" | "expired";
const STATUS: Status[] = ["running", "success", "expired"];

export type Campaign = {
  goal: number;
  raised: number;
  deadline: number; // unix seconds
  recipient: string;
  claimed: boolean;
  status: Status;
};

/** Read the full campaign state in parallel. */
export async function getCampaign(): Promise<Campaign> {
  const [goal, raised, deadline, recipient, claimed, statusCode] = await Promise.all([
    read(CROWDFUND_ID, "get_goal"),
    read(CROWDFUND_ID, "get_raised"),
    read(CROWDFUND_ID, "get_deadline"),
    read(CROWDFUND_ID, "get_recipient"),
    read(CROWDFUND_ID, "is_claimed"),
    read(CROWDFUND_ID, "get_status"),
  ]);
  return {
    goal: Number(goal),
    raised: Number(raised),
    deadline: Number(deadline),
    recipient: String(recipient),
    claimed: Boolean(claimed),
    status: STATUS[Number(statusCode)] ?? "running",
  };
}

export async function getMyPledge(address: string): Promise<number> {
  return Number(await read(CROWDFUND_ID, "pledge_of", [addr(address)]));
}

export async function getTokenBalance(address: string): Promise<number> {
  return Number(await read(TOKEN_ID, "balance", [addr(address)]));
}

export type WriteStage = "building" | "signing" | "sending" | "confirming";
export type OnStage = (stage: WriteStage) => void;

/** Build -> prepare (simulate + auth) -> wallet sign -> submit -> poll. Returns tx hash. */
async function write(
  source: string,
  contractId: string,
  method: string,
  args: ScArg[],
  onStage?: OnStage,
): Promise<string> {
  onStage?.("building");
  const account = await server.getAccount(source);
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  // prepareTransaction simulates and applies footprint + auth (incl. the
  // cross-contract token.transfer sub-invocation for `contribute`).
  const prepared = await server.prepareTransaction(tx);

  onStage?.("signing");
  let signedXdr: string;
  try {
    signedXdr = await signXdr(prepared.toXDR(), source);
  } catch (err) {
    throw new Error(describeWalletError(err));
  }
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  onStage?.("sending");
  const sent = await server.sendTransaction(signedTx);
  if (sent.status !== "PENDING") {
    throw new Error(`Submission failed (${sent.status}).`);
  }

  onStage?.("confirming");
  let got = await server.getTransaction(sent.hash);
  let tries = 0;
  while (got.status === "NOT_FOUND" && tries < 30) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      got = await server.getTransaction(sent.hash);
    } catch {
      // transient RPC error; keep polling within the budget
    }
    tries += 1;
  }
  if (got.status === "NOT_FOUND") {
    throw new Error("Timed out waiting for confirmation. Check the explorer.");
  }
  if (got.status !== "SUCCESS") {
    const detail = "resultXdr" in got && got.resultXdr ? ` (${String(got.resultXdr)})` : "";
    throw new Error(`Transaction ${got.status.toLowerCase()}${detail}.`);
  }
  return sent.hash;
}

/** Mint demo PLEDGE tokens to the caller (permissionless faucet). */
export function faucet(address: string, onStage?: OnStage): Promise<string> {
  return write(address, TOKEN_ID, "faucet", [addr(address)], onStage);
}

/** Contribute `amount` PLEDGE to the campaign (cross-contract call to the token). */
export function contribute(address: string, amount: number, onStage?: OnStage): Promise<string> {
  return write(address, CROWDFUND_ID, "contribute", [addr(address), i128(amount)], onStage);
}

/** Recipient claims the pot after a successful campaign. */
export function claim(address: string, onStage?: OnStage): Promise<string> {
  return write(address, CROWDFUND_ID, "claim", [], onStage);
}

/** Contributor refunds their pledge after a failed campaign. */
export function refund(address: string, onStage?: OnStage): Promise<string> {
  return write(address, CROWDFUND_ID, "refund", [addr(address)], onStage);
}

export type CrowdfundEvent = {
  id: string;
  ledger: number;
  txHash: string;
  source: "token" | "crowdfund";
  topic: string;
  amount: number;
};

const TOKEN_TOPICS = new Set(["faucet", "mint", "transfer"]);

/** Recent events emitted by the token and crowdfund contracts (newest first). */
export async function getRecentEvents(limit = 12): Promise<CrowdfundEvent[]> {
  const latest = await server.getLatestLedger();
  const startLedger = Math.max(latest.sequence - 2000, 1);
  const res = await server.getEvents({
    startLedger,
    filters: [{ type: "contract", contractIds: [TOKEN_ID, CROWDFUND_ID] }],
    limit,
  });
  return res.events
    .map((e) => {
      const topic = e.topic[0] ? String(scValToNative(e.topic[0])) : "event";
      const source: CrowdfundEvent["source"] = TOKEN_TOPICS.has(topic) ? "token" : "crowdfund";
      return {
        id: e.id,
        ledger: e.ledger,
        txHash: e.txHash,
        source,
        topic,
        amount: Number(scValToNative(e.value)),
      };
    })
    .reverse();
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Something went wrong. Please try again.";
}
