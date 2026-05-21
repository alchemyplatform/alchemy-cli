---
"@alchemy/cli": patch
---

Add `alchemy evm token <SYMBOL>` and `alchemy evm token list` for resolving common token addresses (ETH, USDC, WETH, USDT, DAI, …) per chain from a curated registry. `--address-only` prints just the 0x address for easy shell composition: `--from $(alchemy evm token ETH --address-only)`.
