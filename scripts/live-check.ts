import { formatEther, formatUnits } from "viem";
import {
  formatEvmBalance,
  formatSolBalance,
  getLiveBalanceStatus,
  loadLiveConfig,
} from "../tests/live/helpers/live-env.js";

async function main(): Promise<void> {
  const jsonMode = process.argv.includes("--json");
  const config = await loadLiveConfig();
  const balances = await getLiveBalanceStatus(config);
  const evmWei = balances.evmWei ?? 0n;
  const solLamports = balances.solLamports ?? 0n;
  const ready = balances.evmReady && balances.solanaReady;

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          evm: {
            network: config.evmNetwork,
            address: config.evmAddress,
            recipient: config.evmRecipient,
            contract: config.evmContractAddress,
            gasPolicyId: config.evmGasPolicyId ?? null,
            balanceWei: evmWei.toString(),
            balanceEth: formatEther(evmWei),
            minimumWei: config.minEvmWei.toString(),
            minimumEth: formatEther(config.minEvmWei),
            sendAmount: config.evmSendAmount,
            depositAmount: config.evmDepositAmount,
            ready: balances.evmReady,
          },
          solana: {
            network: config.solanaNetwork,
            address: config.solanaAddress,
            recipient: config.solanaRecipient,
            gasPolicyId: config.solanaGasPolicyId ?? null,
            balanceLamports: solLamports.toString(),
            balanceSol: formatUnits(solLamports, 9),
            minimumLamports: config.minSolLamports.toString(),
            minimumSol: formatUnits(config.minSolLamports, 9),
            sendAmount: config.solanaSendAmount,
            ready: balances.solanaReady,
          },
          ready,
        },
        null,
        2,
      ),
    );
    if (!ready) {
      process.exitCode = 1;
    }
    return;
  }

  console.log("Live test preflight");
  console.log("");
  console.log(`EVM network: ${config.evmNetwork}`);
  console.log(`EVM sender: ${config.evmAddress}`);
  console.log(`EVM recipient: ${config.evmRecipient}`);
  console.log(`EVM harness: ${config.evmContractAddress}`);
  console.log(`EVM sponsored flow: ${config.evmGasPolicyId ? `enabled (${config.evmGasPolicyId})` : "disabled"}`);
  console.log(`EVM balance: ${formatEvmBalance(evmWei)}`);
  console.log(`EVM minimum: ${formatEvmBalance(config.minEvmWei)}`);
  console.log(`EVM send amount: ${config.evmSendAmount} ETH`);
  console.log(`EVM deposit amount: ${config.evmDepositAmount} ETH`);
  console.log("");
  console.log(`Solana network: ${config.solanaNetwork}`);
  console.log(`Solana sender: ${config.solanaAddress}`);
  console.log(`Solana recipient: ${config.solanaRecipient}`);
  console.log(`Solana sponsored flow: ${config.solanaGasPolicyId ? `enabled (${config.solanaGasPolicyId})` : "disabled"}`);
  console.log(`Solana balance: ${formatSolBalance(solLamports)}`);
  console.log(`Solana minimum: ${formatSolBalance(config.minSolLamports)}`);
  console.log(`Solana send amount: ${config.solanaSendAmount} SOL`);
  console.log("");

  if (ready) {
    console.log("Status: ready");
    return;
  }

  console.log("Status: needs funding");
  if (!balances.evmReady) {
    console.log(`Fund EVM sender ${config.evmAddress} on ${config.evmNetwork}.`);
  }
  if (!balances.solanaReady) {
    console.log(`Fund Solana sender ${config.solanaAddress} on ${config.solanaNetwork}.`);
  }
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
