# X Post Draft

## Short Version

Built Agent Allowance Lab for the Superteam Canada Solana subscriptions bounty.

The demo shows a wallet giving an AI agent a fixed devnet budget: spend 2, spend 5, then fail closed when it tries to pull 8 more.

Useful agents need spending authority. Users need limits and receipts.

Repo: https://github.com/SathianSrikrishnan/solana-agent-allowance-demo

## Longer Thread Starter

AI agents should not receive raw wallets.

They should receive explicit budgets.

I built Agent Allowance Lab for the Superteam Canada Solana Native Subscriptions and Allowances bounty. It is a small devnet demo where a user grants an agent a fixed token allowance, the agent spends inside the cap, and an over-budget action fails closed.

The interesting part is not "subscriptions" in the narrow billing sense. It is programmable permissioning for internet-native software:

- capped agent/API spending
- recurring budgets
- revocation and expiry
- receipt-first automation

Canada angle: I think this matters for practical commerce, fintech, and AI workflows. Shopify-style app budgets, Wealthsimple-style spending envelopes, and paid AI/data tools all need safer ways to authorize automation.

Demo repo: https://github.com/SathianSrikrishnan/solana-agent-allowance-demo

Deep dive: https://github.com/SathianSrikrishnan/solana-agent-allowance-demo/blob/main/docs/deep-dive.md
