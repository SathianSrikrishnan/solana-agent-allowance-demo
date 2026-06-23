# Agent Allowance Lab: Wallet-Safe Budgets for AI Agents on Solana

AI agents should not receive raw wallets. They should receive explicit budgets.

That is the idea behind Agent Allowance Lab, a small technical demo built around Solana Native Subscriptions & Allowances. The demo gives an agent wallet a capped devnet allowance, lets it complete two approved transfers, and then shows a larger over-budget transfer fail closed.

The project uses the official `@solana/subscriptions` TypeScript package and the deployed Solana subscriptions program:

```text
De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44
```

The core product thesis is simple:

```text
Useful agents need spending authority, but users need limits, expiry, revocation, and receipts.
```

My angle on this is deliberately practical. I am a Canadian builder and student working through consumer app ideas around children's savings, education, and parent-controlled digital experiences. That means I keep running into the same question: how do you let software do something useful with money without giving it too much authority?

This demo is my smallest useful answer to that question.

## The Problem: Agent Wallet Access Is Too Broad

If an AI agent is going to help with paid actions, it needs some way to pay. That could mean buying API credits, paying for data, renewing a service, posting a transaction, or handling a small operational workflow.

The naive implementation is dangerous: give the agent an API key, wallet key, or custodial account with broad access. That may work for a demo, but it is a poor trust model. If the agent loops, gets prompted badly, misprices an action, or has its environment compromised, the user has little protection.

A better model is bounded authorization:

- the user keeps the wallet;
- the agent receives only a limited allowance;
- the allowance can expire;
- every action produces a receipt;
- over-budget actions fail by default.

This is where Solana Native Subscriptions & Allowances becomes interesting. It is not only a subscription billing primitive. It is a programmable token-permission layer.

## How The Primitive Works

The Solana subscriptions program solves a limitation in the normal SPL Token delegate model: a token account can have only one delegate. That is awkward for a world where a user may want multiple bounded authorizations at the same time.

The program introduces a Subscription Authority PDA for a `(user, mint)` pair. The user approves that authority as the token delegate. The authority itself is not a free-spending wallet. It can only transfer when a separate delegation account allows it.

The program supports three useful models:

1. **Fixed delegation**: a delegatee can spend up to a fixed total amount before an optional expiry.
2. **Recurring delegation**: a delegatee can spend up to a per-period amount that resets each period.
3. **Subscription plan**: a merchant publishes reusable terms, and subscribers opt in to those terms.

Agent Allowance Lab uses fixed delegation because it maps most directly to an agent budget:

```text
User grants agent 7 test USDC.
Agent spends 2.
Agent spends 5.
Agent tries 8 more.
Program denies the transfer.
```

The important part is that the denial is enforced by the on-chain program, not by frontend convention.

## Demo Architecture

The demo script runs on devnet and creates disposable local keypairs:

- a payer wallet for devnet fees and account rent;
- a user wallet that owns the test tokens;
- an agent wallet that receives bounded authority.

The flow is:

1. Create a test USDC-style mint with 6 decimals.
2. Mint 10 test tokens to the user.
3. Initialize the user's Subscription Authority for that mint.
4. Create a Fixed Delegation PDA authorizing the agent for 7 test tokens.
5. Create the agent receiver token account.
6. Let the agent pull 2 test tokens.
7. Let the agent pull 5 test tokens.
8. Attempt an 8-token pull and record the denial.

The script writes a JSON receipt to `receipts/latest.json`. That receipt includes the wallet addresses, mint, PDA addresses, successful transaction links, final balances, and the denied action.

## Why This Is Useful

The immediate use case is AI agent spending. A user could authorize an agent to spend a small amount on research tools, paid APIs, data retrieval, compute, or workflow automation.

The user gets a better trust boundary:

- no private key handoff;
- no unlimited API billing;
- visible allowance;
- program-enforced cap;
- revocable or expiring authorization;
- receipts that can be inspected later.

This also composes with non-agent products. A SaaS company could use subscriptions for billing. A marketplace could publish plans. A data provider could accept bounded pulls. A consumer fintech app could let users create per-merchant or per-agent budgets.

## Tradeoffs

The primitive adds real safety, but it is not magic.

First, users still need clear interfaces. If a wallet approval screen says only "approve delegate," many users will not understand the exact terms. Good products need to surface the allowance amount, token mint, delegatee, expiry, and revocation path clearly.

Second, allowance logic protects token movement, not off-chain intent. If an agent buys the wrong data inside the allowed cap, the program cannot know that the purchase was semantically wrong. Application-level policy and human review still matter.

Third, devnet demos should not be confused with production readiness. A production version would need stronger key management, better RPC reliability, richer error decoding, monitoring, rate limits, and a carefully reviewed wallet UX.

Fourth, recurring and subscription-plan flows introduce additional product decisions. Fixed delegation is easy to explain; recurring plans and merchant pullers require more attention to cancellation, plan metadata, puller authorization, and destination whitelists.

## Canadian Relevance

The Superteam Canada context matters because Canadian builders are well-positioned to explore practical, useful automation.

I am not treating this as an abstract crypto billing primitive. I am trying to understand how it could show up in real products: a parent-approved wallet flow, a child's savings or education app, a small paid research workflow, or a consumer service where an agent can spend only inside a user-defined limit.

Three examples:

- **Shopify-style commerce workflows**: merchants and app developers could experiment with customer-authorized recurring payments, per-app budgets, and bounded agent actions for store operations.
- **Wealthsimple-style consumer finance UX**: consumer products could expose explicit spending envelopes for automation instead of relying on broad account access.
- **Canadian AI and data-service builders**: agents that call paid tools can use allowance receipts as a trust layer, especially when tools are metered or usage-based.

Agent Allowance Lab is intentionally small, but the pattern is larger:

```text
Give software useful authority without giving it unlimited authority.
```

That is a good design principle for AI agents, consumer apps, and internet-native business workflows.

## What I Would Build Next

The next version would add:

- a small browser UI showing allowance, remaining budget, and receipts;
- recurring delegation support for weekly or monthly agent budgets;
- revocation and expiry demos;
- wallet-adapter integration;
- better error decoding for denied actions;
- optional adapters for paper-mode market research, paid API lookups, or data purchases.

I would not start with real-money trading or production private keys. The point of the primitive is controlled authority, so the product should preserve that principle from the first screen.

## References

- Solana announcement: https://solana.com/news/subscriptions-and-allowances
- Official subscriptions repository: https://github.com/solana-program/subscriptions
- Solana subscription plan docs: https://solana.com/docs/payments/subscriptions/subscription-plan
- Chainstack guide: https://docs.chainstack.com/docs/solana-subscriptions-and-allowances
