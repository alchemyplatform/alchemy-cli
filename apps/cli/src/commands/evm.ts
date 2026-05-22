import { Command } from "commander";
import { registerApprove } from "./approve.js";
import { registerBlock } from "./block.js";
import { registerContract } from "./contract.js";
import { registerData } from "./data.js";
import { registerDebug } from "./debug.js";
import { registerGas } from "./gas.js";
import { registerLogs } from "./logs.js";
import { registerNetwork } from "./network.js";
import { registerReceipt } from "./receipt.js";
import { registerRPC } from "./rpc.js";
import { registerEvmSend } from "./send-evm.js";
import { registerSimulate } from "./simulate.js";
import { registerStatus } from "./status.js";
import { registerSwap } from "./swap.js";
import { registerEvmToken } from "./evm-token.js";
import { registerTrace } from "./trace.js";
import { registerTx } from "./tx.js";

export function registerEvm(program: Command) {
  const cmd = program
    .command("evm")
    .description("EVM RPC, data, and onchain actions");

  registerRPC(cmd);
  registerData(cmd);
  registerEvmSend(cmd);
  registerContract(cmd);
  registerSwap(cmd);
  registerEvmToken(cmd);
  registerApprove(cmd);
  registerStatus(cmd);
  registerNetwork(cmd);

  registerTx(cmd);
  registerReceipt(cmd);
  registerBlock(cmd);
  registerTrace(cmd);
  registerDebug(cmd);
  registerGas(cmd);
  registerLogs(cmd);
  registerSimulate(cmd);
}
