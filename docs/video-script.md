# 60 Second Demo Video Script

## Goal

Record a fast screen walkthrough for the Superteam technical demo submission.

Length target: 45-75 seconds.

## Recording Setup

Show:

1. `README.md`
2. terminal running `npm run demo`
3. `receipts/latest.json`

No webcam needed. Voiceover is enough.

## Script

**0-10s**

"I built Agent Allowance Lab to show how a Solana wallet can give an AI agent a capped budget without giving it raw wallet access."

**10-20s**

"The demo creates a devnet test token, mints 10 test USDC to a user wallet, and initializes the Solana Native Subscriptions and Allowances authority for that token account."

**20-35s**

"Then the user grants this agent wallet a fixed 7 test USDC allowance. The agent spends 2, then spends 5. Both actions confirm because they are inside the approved cap."

**35-50s**

"The agent then tries to pull 8 more. That action is denied because the fixed allowance is exhausted. The failure is enforced by the Solana program, not just by the frontend."

**50-60s**

"The receipt file records the addresses, PDA, successful transaction links, final balances, and denied action. The point is simple: useful agents need spending authority, but users need limits and receipts."

## One-Take Version

"This is Agent Allowance Lab. It shows how a Solana wallet can give an AI agent a capped budget without giving it raw wallet access. The script creates a devnet test token, mints 10 test USDC to a user, initializes the Solana subscriptions authority, and grants an agent a fixed 7 test USDC allowance. The agent spends 2, then 5, and both transfers confirm. Then it tries to spend 8 more and the program denies it because the cap is exhausted. The receipt file records the wallets, PDA, transaction links, final balances, and denied action. Useful agents need spending authority, but users need limits and receipts."

