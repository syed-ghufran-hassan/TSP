# Stacks Token Streaming

A smart contract for streaming STX tokens over time on the Stacks blockchain. This contract enables continuous, block-by-block token transfers between parties with features like refueling streams, signature-based stream updates, and balance withdrawals.

## Features

- **Stream Creation**: Create STX payment streams with customizable timeframes and payment-per-block rates
- **Real-time Streaming**: Tokens are streamed block-by-block based on the current block height
- **Refuel Streams**: Senders can add more tokens to active streams
- **Withdraw Tokens**: Recipients can withdraw their accumulated balance at any time
- **Refund Excess**: Senders can reclaim unused tokens after stream completion
- **Signature-based Updates**: Both parties can update stream parameters with cryptographic signature verification
- **Balance Tracking**: Check available balance for any party in a stream

## Smart Contract

The main contract is located at `contracts/stream.clar` and includes:

### Public Functions

#### `stream-to`
Creates a new token stream.

```clarity
(stream-to
  (recipient principal)
  (initial-balance uint)
  (timeframe {start-block: uint, stop-block: uint})
  (payment-per-block uint))
```

#### `refuel`
Adds more STX to an existing stream (sender only).

```clarity
(refuel (stream-id uint) (amount uint))
```

#### `withdraw`
Withdraws accumulated tokens (recipient only).

```clarity
(withdraw (stream-id uint))
```

#### `refund`
Withdraws excess tokens after stream ends (sender only).

```clarity
(refund (stream-id uint))
```

#### `update-details`
Updates stream parameters with signature verification.

```clarity
(update-details
  (stream-id uint)
  (payment-per-block uint)
  (timeframe {start-block: uint, stop-block: uint})
  (signer principal)
  (signature (buff 65)))
```

### Read-only Functions

#### `balance-of`
Returns the available balance for a party in a stream.

```clarity
(balance-of (stream-id uint) (who principal))
```

#### `calculate-block-delta`
Calculates the number of active blocks for a timeframe.

```clarity
(calculate-block-delta (timeframe {start-block: uint, stop-block: uint}))
```

#### `hash-stream`
Generates a hash for stream update verification.

```clarity
(hash-stream
  (stream-id uint)
  (new-payment-per-block uint)
  (new-timeframe {start-block: uint, stop-block: uint}))
```

#### `validate-signature`
Validates cryptographic signatures for stream updates.

```clarity
(validate-signature
  (hash (buff 32))
  (signature (buff 65))
  (signer principal))
```

## Error Codes

| Code | Constant | Description |
|------|----------|-------------|
| `u0` | `ERR_UNAUTHORIZED` | Caller is not authorized for this operation |
| `u1` | `ERR_INVALID_SIGNATURE` | Signature verification failed |
| `u2` | `ERR_STREAM_STILL_ACTIVE` | Stream is still active (for refunds) |
| `u3` | `ERR_INVALID_STREAM_ID` | Stream ID does not exist |

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [Clarinet](https://github.com/hirosystems/clarinet) (for local development)

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd stacks-token-streaming
```

2. Install dependencies:
```bash
npm install
```

## Testing

This project uses Vitest with Clarinet SDK for testing.

### Run all tests:
```bash
npm test
```

### Run tests with coverage and cost analysis:
```bash
npm run test:report
```

### Watch mode (auto-run tests on file changes):
```bash
npm run test:watch
```

### Test Suite

The test suite (`tests/stream.test.ts`) covers:

- ✅ Contract initialization and stream creation
- ✅ Stream refueling by sender
- ✅ Authorization checks for refueling
- ✅ Token withdrawal over time
- ✅ Authorization checks for withdrawals
- ✅ Excess token refunds after stream completion
- ✅ Signature verification for stream hashes
- ✅ Updating stream parameters with dual-party consent

## How It Works

### Stream Creation

1. Sender calls `stream-to` with recipient, amount, timeframe, and payment rate
2. STX tokens are locked in the contract
3. A unique stream ID is generated and returned

### Token Distribution

- Tokens are distributed based on block height and payment-per-block rate
- Formula: `available_tokens = block_delta * payment_per_block`
- `block_delta` = current block height - start block (capped at stop block)

### Balance Calculations

- **Recipient balance**: `(block_delta * payment_per_block) - withdrawn_balance`
- **Sender balance**: `total_balance - recipient_accumulated_balance`

### Signature-based Updates

Stream parameters can be updated with consent from both parties:
1. One party generates a hash of proposed changes using `hash-stream`
2. One party signs the hash off-chain
3. The other party calls `update-details` with the signature
4. Contract verifies signature and updates stream

## Technology Stack

- **Smart Contract**: Clarity (Stacks blockchain)
- **Testing Framework**: Vitest
- **Stacks SDK**: @stacks/transactions v7.2.0
- **Development Tools**: Clarinet SDK v3.6.0

## Project Structure

```
stacks-token-streaming/
├── contracts/
│   └── stream.clar          # Main streaming contract
├── tests/
│   └── stream.test.ts       # Test suite
├── deployments/             # Deployment configurations
├── settings/                # Network settings
├── Clarinet.toml           # Clarinet configuration
└── package.json            # Node dependencies
```
