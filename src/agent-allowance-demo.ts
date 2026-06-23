import {
  type Address,
  createClient,
  createKeyPairSignerFromBytes,
  generateKeyPairSigner,
  type KeyPairSigner,
  lamports,
  summarizeTransactionPlanResult,
  type TransactionPlanResult,
  writeKeyPairSigner,
} from '@solana/kit';
import { solanaDevnetRpc } from '@solana/kit-plugin-rpc';
import { signer } from '@solana/kit-plugin-signer';
import { systemProgram } from '@solana-program/system';
import {
  fetchToken,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
  tokenProgram,
} from '@solana-program/token';
import {
  fetchFixedDelegation,
  findFixedDelegationPda,
  findSubscriptionAuthorityPda,
  subscriptionsProgram,
} from '@solana/subscriptions';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = join(ROOT_DIR, '.demo-state');
const RECEIPTS_DIR = join(ROOT_DIR, 'receipts');
const PAYER_KEYPAIR_PATH = join(STATE_DIR, 'devnet-payer.json');
const USER_KEYPAIR_PATH = join(STATE_DIR, 'devnet-user.json');
const AGENT_KEYPAIR_PATH = join(STATE_DIR, 'devnet-agent.json');
const DEVNET_RPC_URL = 'https://api.devnet.solana.com';

const MIN_PAYER_BALANCE_LAMPORTS = 75_000_000n;
const AIRDROP_LAMPORTS = 100_000_000n;
const STEP_DELAY_MS = Number(process.env.DEMO_STEP_DELAY_MS ?? '1500');
const SEND_RETRY_ATTEMPTS = Number(process.env.DEMO_SEND_RETRY_ATTEMPTS ?? '4');
const SEND_RETRY_BASE_DELAY_MS = Number(process.env.DEMO_SEND_RETRY_BASE_DELAY_MS ?? '1500');

const DECIMALS = 6;
const TEST_USDC = 1_000_000n;
const USER_INITIAL_TOKENS = 10n * TEST_USDC;
const AGENT_ALLOWANCE = 7n * TEST_USDC;
const FIRST_AGENT_SPEND = 2n * TEST_USDC;
const SECOND_AGENT_SPEND = 5n * TEST_USDC;
const OVER_BUDGET_ATTEMPT = 8n * TEST_USDC;
const NONCE = BigInt(Math.floor(Date.now() / 1000));

type ProofClient = ReturnType<typeof createProofClient>;
type TransactionPlanSender = { sendTransaction: () => Promise<TransactionPlanResult> };
type StepStatus = 'CONFIRMED' | 'DENIED';

type StepReceipt = {
  amount?: string;
  explorer?: string;
  reason?: string;
  signature?: string;
  status: StepStatus;
};

class FundingRequiredError extends Error {
  constructor() {
    super('Funding required. See .demo-state/funding-required.json.');
    this.name = 'FundingRequiredError';
  }
}

type SignatureStatusValue = {
  confirmationStatus?: string | null;
  err?: unknown;
};

function getRpcUrl(): string {
  return process.env.SOLANA_RPC_URL ?? process.env.RPC_URL ?? DEVNET_RPC_URL;
}

function createProofClient(payer: KeyPairSigner) {
  const rpcUrl = getRpcUrl();
  return createClient()
    .use(signer(payer))
    .use(solanaDevnetRpc({ rpcUrl }))
    .use(systemProgram())
    .use(tokenProgram())
    .use(subscriptionsProgram());
}

async function loadOrCreateSigner(path: string): Promise<KeyPairSigner> {
  if (existsSync(path)) {
    const bytes = new Uint8Array(JSON.parse(await readFile(path, 'utf8')) as number[]);
    return await createKeyPairSignerFromBytes(bytes);
  }

  const newSigner = await generateKeyPairSigner(true);
  await mkdir(dirname(path), { recursive: true });
  await writeKeyPairSigner(newSigner, path);
  return newSigner;
}

async function getBalanceLamports(client: ProofClient, address: Address): Promise<bigint> {
  const response = await client.rpc.getBalance(address).send();
  return BigInt(response.value);
}

function sol(lamportAmount: bigint): string {
  return (Number(lamportAmount) / 1_000_000_000).toFixed(6);
}

function tokenAmount(amount: bigint): string {
  return (Number(amount) / 10 ** DECIMALS).toFixed(2);
}

function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

function explorerAddress(address: Address): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return error == null ? 'unknown error' : String(error);
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes('429') || message.includes('too many requests');
}

function extractSignature(error: unknown): string | null {
  const match = errorMessage(error).match(/Failed to send transaction \(([^)]+)\):/);
  return match?.[1] ?? null;
}

async function getSignatureStatus(signature: string): Promise<SignatureStatusValue | null> {
  const response = await fetch(getRpcUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'getSignatureStatuses',
      params: [[signature], { searchTransactionHistory: true }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Signature status RPC failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    result?: { value?: Array<SignatureStatusValue | null> };
  };
  return payload.result?.value?.[0] ?? null;
}

async function waitForConfirmedSignature(signature: string): Promise<SignatureStatusValue | null> {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const status = await getSignatureStatus(signature);
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return status;
    }
    await sleep(1000);
  }
  return null;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify(value, jsonReplacer, 2)}\n`,
  );
}

async function sendStep(step: string, plan: TransactionPlanSender): Promise<StepReceipt> {
  console.log(`running:${step}`);
  let signature: string | null = null;

  for (let attempt = 1; attempt <= SEND_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const result = await plan.sendTransaction();
      const summary = summarizeTransactionPlanResult(result);
      if (!summary.successful || summary.successfulTransactions.length === 0) {
        throw new Error(`Transaction step failed: ${step}`);
      }
      if (summary.successfulTransactions.length > 1) {
        throw new Error(`Transaction step produced multiple receipts: ${step}`);
      }
      signature = String(summary.successfulTransactions[0]!.context.signature);
      break;
    } catch (error) {
      signature = extractSignature(error);
      if (signature) {
        const status = await waitForConfirmedSignature(signature);
        if (status?.err) {
          throw new Error(`Transaction step failed on-chain: ${step}: ${JSON.stringify(status.err)}`);
        }
        if (status) {
          console.log(`recovered-confirmed:${step}:${explorerTx(signature)}`);
          break;
        }
        throw new Error(`Transaction step has ambiguous RPC status: ${step}: ${signature}`);
      }

      if (!isRateLimitError(error) || attempt === SEND_RETRY_ATTEMPTS) {
        throw error;
      }

      const delay = SEND_RETRY_BASE_DELAY_MS * attempt;
      console.log(`retry:${step}:attempt ${attempt + 1}/${SEND_RETRY_ATTEMPTS}:waiting ${delay}ms`);
      await sleep(delay);
    }
  }

  if (!signature) {
    throw new Error(`Transaction step did not produce a signature: ${step}`);
  }

  console.log(`confirmed:${step}:${explorerTx(signature)}`);
  await sleep(STEP_DELAY_MS);
  return {
    explorer: explorerTx(signature),
    signature,
    status: 'CONFIRMED',
  };
}

async function expectDenied(
  step: string,
  amount: bigint,
  makePlan: () => TransactionPlanSender,
): Promise<StepReceipt> {
  console.log(`running:${step}`);
  try {
    const result = await makePlan().sendTransaction();
    const summary = summarizeTransactionPlanResult(result);
    if (summary.successful) {
      throw new Error(`Expected ${step} to be denied, but it confirmed.`);
    }
    return {
      amount: tokenAmount(amount),
      reason: JSON.stringify(summary),
      status: 'DENIED',
    };
  } catch (error) {
    const reason = errorMessage(error);
    console.log(`denied:${step}:${reason}`);
    return {
      amount: tokenAmount(amount),
      reason,
      status: 'DENIED',
    };
  }
}

async function ensurePayerFunded(client: ProofClient, payer: KeyPairSigner): Promise<bigint> {
  let balance = await getBalanceLamports(client, payer.address);
  if (balance >= MIN_PAYER_BALANCE_LAMPORTS) {
    return balance;
  }

  try {
    console.log(`airdrop:request:${sol(AIRDROP_LAMPORTS)} SOL:${payer.address}`);
    await client.airdrop(payer.address, lamports(AIRDROP_LAMPORTS));
    balance = await getBalanceLamports(client, payer.address);
  } catch (error) {
    await printFundingRequired(payer.address, balance, error);
    throw new FundingRequiredError();
  }

  if (balance < MIN_PAYER_BALANCE_LAMPORTS) {
    await printFundingRequired(payer.address, balance);
    throw new FundingRequiredError();
  }

  return balance;
}

async function printFundingRequired(address: Address, balance: bigint, error?: unknown): Promise<void> {
  const status = {
    status: 'FUNDING_REQUIRED',
    network: 'devnet',
    address,
    explorer: explorerAddress(address),
    currentSol: sol(balance),
    minimumSol: sol(MIN_PAYER_BALANCE_LAMPORTS),
    retryCommand: 'npm run demo',
    reason: errorMessage(error ?? 'balance below minimum'),
  };
  await writeJson(join(STATE_DIR, 'funding-required.json'), status);
  console.log(JSON.stringify(status, null, 2));
}

async function main(): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  await mkdir(RECEIPTS_DIR, { recursive: true });

  const payer = await loadOrCreateSigner(PAYER_KEYPAIR_PATH);
  const user = await loadOrCreateSigner(USER_KEYPAIR_PATH);
  const agent = await loadOrCreateSigner(AGENT_KEYPAIR_PATH);
  const client = createProofClient(payer);
  const receipts: Record<string, StepReceipt> = {};

  console.log(`payer:${payer.address}`);
  console.log(`user:${user.address}`);
  console.log(`agent:${agent.address}`);

  const startingBalance = await ensurePayerFunded(client, payer);
  console.log(`payer-balance:${sol(startingBalance)} SOL`);

  const mint = await generateKeyPairSigner();
  receipts['create-test-usdc-mint'] = await sendStep(
    'create-test-usdc-mint',
    client.token.instructions.createMint({
      decimals: DECIMALS,
      mintAuthority: payer.address,
      newMint: mint,
    }),
  );

  const [userAta] = await findAssociatedTokenPda({
    mint: mint.address,
    owner: user.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  receipts['mint-user-balance'] = await sendStep(
    'mint-user-balance',
    client.token.instructions.mintToATA({
      amount: USER_INITIAL_TOKENS,
      decimals: DECIMALS,
      mint: mint.address,
      mintAuthority: payer,
      owner: user.address,
    }),
  );

  receipts['init-user-allowance-authority'] = await sendStep(
    'init-user-allowance-authority',
    client.subscriptions.instructions.initSubscriptionAuthority({
      owner: user,
      payer,
      tokenMint: mint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      userAta,
    }),
  );

  const expiryTs = BigInt(Math.floor(Date.now() / 1000) + 3600);
  receipts['user-grants-agent-fixed-allowance'] = await sendStep(
    'user-grants-agent-fixed-allowance',
    client.subscriptions.instructions.createFixedDelegation({
      amount: AGENT_ALLOWANCE,
      delegatee: agent.address,
      delegator: user,
      expiryTs,
      nonce: NONCE,
      payer,
      tokenMint: mint.address,
    }),
  );

  const [subscriptionAuthority] = await findSubscriptionAuthorityPda({
    tokenMint: mint.address,
    user: user.address,
  });
  const [delegationPda] = await findFixedDelegationPda({
    delegatee: agent.address,
    delegator: user.address,
    nonce: NONCE,
    subscriptionAuthority,
  });
  const [agentAta] = await findAssociatedTokenPda({
    mint: mint.address,
    owner: agent.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  receipts['create-agent-receiver-token-account'] = await sendStep(
    'create-agent-receiver-token-account',
    client.token.instructions.mintToATA({
      amount: 0n,
      decimals: DECIMALS,
      mint: mint.address,
      mintAuthority: payer,
      owner: agent.address,
    }),
  );

  receipts['agent-spends-2-test-usdc'] = {
    ...(await sendStep(
      'agent-spends-2-test-usdc',
      client.subscriptions.instructions.transferFixed({
        amount: FIRST_AGENT_SPEND,
        delegatee: agent,
        delegationPda,
        delegator: user.address,
        delegatorAta: userAta,
        receiverAta: agentAta,
        tokenMint: mint.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      }),
    )),
    amount: tokenAmount(FIRST_AGENT_SPEND),
  };

  receipts['agent-spends-5-test-usdc'] = {
    ...(await sendStep(
      'agent-spends-5-test-usdc',
      client.subscriptions.instructions.transferFixed({
        amount: SECOND_AGENT_SPEND,
        delegatee: agent,
        delegationPda,
        delegator: user.address,
        delegatorAta: userAta,
        receiverAta: agentAta,
        tokenMint: mint.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      }),
    )),
    amount: tokenAmount(SECOND_AGENT_SPEND),
  };

  receipts['agent-over-budget-attempt'] = await expectDenied(
    'agent-over-budget-attempt',
    OVER_BUDGET_ATTEMPT,
    () =>
      client.subscriptions.instructions.transferFixed({
        amount: OVER_BUDGET_ATTEMPT,
        delegatee: agent,
        delegationPda,
        delegator: user.address,
        delegatorAta: userAta,
        receiverAta: agentAta,
        tokenMint: mint.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      }),
  );

  const userTokenAccount = await fetchToken(client.rpc, userAta);
  const agentTokenAccount = await fetchToken(client.rpc, agentAta);
  const delegation = await fetchFixedDelegation(client.rpc, delegationPda);

  const proof = {
    status: 'COMPLETE',
    demo: 'Agent Allowance Lab',
    summary:
      'A wallet owner granted an AI agent a capped fixed allowance. Two pulls succeeded inside the cap; a larger pull failed closed.',
    network: 'devnet',
    program: 'Solana Native Subscriptions & Allowances',
    programId: 'De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44',
    actors: {
      payer: payer.address,
      user: user.address,
      agent: agent.address,
    },
    mint: mint.address,
    subscriptionAuthority,
    delegationPda,
    tokenAccounts: {
      userAta,
      agentAta,
    },
    allowance: {
      grantedTestUsdc: tokenAmount(AGENT_ALLOWANCE),
      firstSpendTestUsdc: tokenAmount(FIRST_AGENT_SPEND),
      secondSpendTestUsdc: tokenAmount(SECOND_AGENT_SPEND),
      deniedAttemptTestUsdc: tokenAmount(OVER_BUDGET_ATTEMPT),
      remainingBaseUnits: delegation.data.amount,
      expiryTs,
    },
    balances: {
      userBaseUnits: userTokenAccount.data.amount,
      agentBaseUnits: agentTokenAccount.data.amount,
    },
    explorer: {
      payer: explorerAddress(payer.address),
      user: explorerAddress(user.address),
      agent: explorerAddress(agent.address),
      mint: explorerAddress(mint.address),
      subscriptionAuthority: explorerAddress(subscriptionAuthority),
      delegationPda: explorerAddress(delegationPda),
    },
    receipts,
  };

  const receiptPath = join(RECEIPTS_DIR, `agent-allowance-devnet-${NONCE}.json`);
  await writeJson(receiptPath, proof);
  await writeJson(join(RECEIPTS_DIR, 'latest.json'), proof);

  console.log(JSON.stringify({ status: proof.status, receiptPath, proof }, jsonReplacer, 2));
}

main().catch(error => {
  if (error instanceof FundingRequiredError) {
    process.exitCode = 2;
    return;
  }

  console.error(
    JSON.stringify(
      {
        status: 'ERROR',
        message: errorMessage(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
