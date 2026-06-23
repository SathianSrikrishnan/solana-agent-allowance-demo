# Agent Allowance Lab

Agent Allowance Lab is a small TypeScript demo for Solana Native Subscriptions & Allowances.

It shows a wallet-safe AI agent budget:

1. A user wallet receives 10 test USDC on devnet.
2. The user initializes a Solana Subscription Authority for that token account.
3. The user grants an agent wallet a fixed 7 test USDC allowance.
4. The agent pulls 2 test USDC.
5. The agent pulls 5 test USDC.
6. The agent tries to pull 8 more test USDC and is denied because the cap is exhausted.

The point is simple: an AI agent can act inside an explicit budget without receiving raw wallet access.

## Why This Matters

AI agents are starting to perform useful work across APIs, payments, data services, research workflows, and commerce. A normal wallet handoff is too broad for that world. An agent should not receive a private key or unlimited wallet authority.

Solana Native Subscriptions & Allowances offers a better primitive:

- fixed allowances for one-time bounded spending;
- recurring allowances for period-based limits;
- subscription plans for published merchant terms.

This demo uses the fixed allowance path because it is the clearest fit for an AI agent budget.

## Architecture

```text
User token account
  -> approves Subscription Authority PDA
  -> creates Fixed Delegation PDA for agent
  -> agent can transfer only while the delegation allows it
```

The Subscription Authority receives token delegate approval, but it cannot spend by itself. A transfer must pass through a delegation account that validates:

- the correct delegator;
- the correct delegatee;
- the correct mint;
- the remaining allowance;
- the expiry timestamp.

## Tech Stack

- TypeScript
- `@solana/kit`
- `@solana/subscriptions`
- SPL Token devnet test mint
- Solana devnet

## Setup

```powershell
# Source / context:
# Agent Allowance Lab demo repo

cd "C:\Users\sathi\Projects\solana-agent-allowance-demo"

# Commands:
npm install
copy .env.example .env
npm run typecheck
npm run demo
```

If public devnet airdrop is rate-limited, fund the generated payer address with devnet SOL and rerun:

```powershell
# Source / context:
# Agent Allowance Lab devnet payer funding status

cd "C:\Users\sathi\Projects\solana-agent-allowance-demo"

# Commands:
Get-Content ".demo-state\funding-required.json"
npm run demo
```

The script writes proof receipts to:

```text
receipts/latest.json
```

## Expected Receipt Shape

Successful runs include:

- payer, user, and agent devnet addresses;
- mint address;
- Subscription Authority PDA;
- Fixed Delegation PDA;
- allowed transfer signatures;
- denied over-budget attempt;
- final user and agent token balances.

The most important receipt fields are:

```json
{
  "status": "COMPLETE",
  "demo": "Agent Allowance Lab",
  "allowance": {
    "grantedTestUsdc": "7.00",
    "firstSpendTestUsdc": "2.00",
    "secondSpendTestUsdc": "5.00",
    "deniedAttemptTestUsdc": "8.00",
    "remainingBaseUnits": "0"
  },
  "receipts": {
    "agent-spends-2-test-usdc": {
      "status": "CONFIRMED"
    },
    "agent-spends-5-test-usdc": {
      "status": "CONFIRMED"
    },
    "agent-over-budget-attempt": {
      "status": "DENIED"
    }
  }
}
```

## Demo Script

The runnable script is:

```text
src/agent-allowance-demo.ts
```

It creates disposable devnet keypairs under `.demo-state/`. That folder is ignored by Git and must not be committed.

## Canadian Context

This was built by a Canadian builder as a small demo for Superteam Canada.

The broader Canadian opportunity is not only crypto subscriptions. It is safer automation for businesses and consumers:

- Canadian SaaS and commerce companies could let customers authorize bounded agent/API spending.
- Canadian fintech products could expose explicit user-controlled spending limits for automated workflows.
- Canadian AI builders could use allowance receipts as a trust layer for agents that need to pay for tools, data, or services.

## Resources

- Solana announcement: https://solana.com/news/subscriptions-and-allowances
- Official subscriptions repository: https://github.com/solana-program/subscriptions
- Solana subscription plan docs: https://solana.com/docs/payments/subscriptions/subscription-plan
- Chainstack guide: https://docs.chainstack.com/docs/solana-subscriptions-and-allowances

## Safety Notes

- This demo uses devnet only.
- It creates disposable local keypairs.
- It does not use production private keys.
- It does not perform real-money trading.
- It demonstrates bounded token transfers and fail-closed behavior.

