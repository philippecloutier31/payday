# Sweep Scripts - Manual Fund Recovery

This directory contains scripts to manually sweep funds from payment addresses to your main wallet.

## Quick Start

### Bitcoin (BTC)
```bash
# Sweep a single BTC address
node scripts/sweep-btc-single.js <PRIVATE_KEY> <RECEIVER_ADDRESS>

# Sweep all BTC addresses from wallet-index.json
node scripts/sweep-btc.js
```

### Ethereum (ETH)
```bash
# Sweep a single ETH address
node scripts/sweep-eth-single.js <PRIVATE_KEY> <RECEIVER_ADDRESS>

# Sweep all ETH addresses from wallet-index.json
node scripts/sweep-eth.js
```

## Scripts Overview

### `sweep-btc-single.js`
Sweeps funds from a single Bitcoin address.

**Usage:**
```bash
node scripts/sweep-btc-single.js <PRIVATE_KEY> <RECEIVER_ADDRESS>
```

**Example:**
```bash
node scripts/sweep-btc-single.js L4rK1yDtCWekvXuE6oXD9jCYgFJ2Nj7m4j3k5v2w1x9y8z7q6w5e3r1t2y3u4i5o 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
```

**Features:**
- Checks balance before sweeping
- Estimates transaction fee
- Shows safety countdown before broadcasting
- Uses multiple RPC endpoints (BlockCypher, Mempool.space, Blockstream)
- Displays transaction hash and explorer link

### `sweep-btc.js`
Sweeps funds from ALL Bitcoin addresses in `data/wallet-index.json`.

**Usage:**
```bash
node scripts/sweep-btc.js
```

**Features:**
- Reads all BTC addresses from wallet-index.json
- Checks each address for balance
- Sweeps only addresses with funds
- Skips already swept addresses
- Shows progress for each address

### `sweep-eth-single.js`
Sweeps funds from a single Ethereum address.

**Usage:**
```bash
node scripts/sweep-eth-single.js <PRIVATE_KEY> <RECEIVER_ADDRESS>
```

**Example:**
```bash
node scripts/sweep-eth-single.js 0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

**Features:**
- Checks balance before sweeping
- Estimates gas fee dynamically
- Shows safety countdown before broadcasting
- Uses multiple RPC endpoints (LlamaRPC, Ankr, PublicNode, DRPC)
- Displays transaction hash and Etherscan link

### `sweep-eth.js`
Sweeps funds from ALL Ethereum addresses in `data/wallet-index.json`.

**Usage:**
```bash
node scripts/sweep-eth.js
```

**Features:**
- Reads all ETH addresses from wallet-index.json
- Checks each address for balance
- Sweeps only addresses with funds
- Skips already swept addresses
- Shows progress for each address

## How It Works

### Bitcoin Sweep Process
1. **Connect to RPC** - Tries multiple endpoints until one works
2. **Check Balance** - Queries UTXOs for the address
3. **Build Transaction** - Creates a transaction sending all funds minus fee
4. **Estimate Fee** - Calculates fee based on transaction size
5. **Safety Countdown** - 5-second countdown to review before broadcasting
6. **Broadcast** - Sends transaction to the network
7. **Confirm** - Displays transaction hash and explorer link

### Ethereum Sweep Process
1. **Connect to RPC** - Tries multiple endpoints until one works
2. **Check Balance** - Queries ETH balance for the address
3. **Estimate Gas** - Gets current gas price and estimates gas limit
4. **Calculate Fee** - Computes total gas cost
5. **Safety Countdown** - 5-second countdown to review before broadcasting
6. **Broadcast** - Sends transaction to the network
7. **Confirm** - Displays transaction hash and Etherscan link

## Finding Private Keys

### From wallet-index.json
The `data/wallet-index.json` file contains all generated addresses and their private keys:

```json
{
  "btc": {
    "addresses": [
      {
        "address": "bc1q...",
        "privateKey": "L4rK...",
        "index": 0,
        "swept": false
      }
    ]
  },
  "eth": {
    "addresses": [
      {
        "address": "0x...",
        "privateKey": "0x4c08...",
        "index": 0,
        "swept": false
      }
    ]
  }
}
```

### From sessions.json
The `data/sessions.json` file contains payment sessions with private keys:

```json
{
  "sessions": [
    {
      "id": "...",
      "paymentAddress": "bc1q...",
      "privateKey": "L4rK...",
      "status": "completed"
    }
  ]
}
```

## Common Issues

### "No funds to sweep"
- The address has zero balance
- Check the address on a block explorer to confirm

### "Insufficient funds to cover gas fee" (ETH)
- The balance is too low to pay the gas fee
- Wait for gas prices to drop or add more ETH to the address

### "Limits reached" (BTC)
- BlockCypher API rate limit
- The script will automatically try Mempool.space or Blockstream as fallback

### "Failed to connect to all RPC endpoints"
- Network connectivity issue
- All RPC endpoints are down
- Try again later or use a different RPC endpoint

## Safety Features

1. **5-Second Countdown** - All scripts show a countdown before broadcasting
2. **Balance Check** - Verifies funds exist before building transaction
3. **Fee Estimation** - Shows exact fee amount before sending
4. **Transaction Preview** - Displays all transaction details before broadcasting
5. **Explorer Links** - Provides links to view transaction on block explorers

## RPC Endpoints

### Bitcoin
- BlockCypher: `https://api.blockcypher.com/v1/btc/main`
- Mempool.space: `https://mempool.space/api`
- Blockstream: `https://blockstream.info/api`

### Ethereum
- LlamaRPC: `https://eth.llamarpc.com`
- Ankr: `https://rpc.ankr.com/eth`
- PublicNode: `https://ethereum.publicnode.com`
- DRPC: `https://eth.drpc.org`

## Best Practices

1. **Test with small amounts first** - Verify the script works with a small test transaction
2. **Keep backups** - Always backup wallet-index.json and sessions.json
3. **Verify on explorer** - Check transactions on block explorers after sweeping
4. **Monitor fees** - Check current network fees before sweeping large amounts
5. **Use main receiver address** - Sweep to your main wallet address from .env

## Troubleshooting

### Script hangs or times out
- Check internet connection
- Try a different RPC endpoint
- Verify the private key is correct

### Transaction not confirmed
- Check transaction hash on block explorer
- Wait for network confirmation (BTC: ~10 min, ETH: ~15 sec)
- If stuck, the fee might be too low

### Wrong receiver address
- Double-check the receiver address before running
- Verify the address format (BTC starts with 1, 3, or bc1; ETH starts with 0x)
- Test with a small amount first

## Support

For issues or questions:
1. Check the logs for error messages
2. Verify your RPC endpoints are accessible
3. Confirm private keys and addresses are correct
4. Check block explorer for transaction status
