import { Command } from "commander";
import { registerBalance } from "./balance.js";
import { registerNFTs } from "./nfts.js";
import { registerTokens } from "./tokens.js";
import { registerTransfers } from "./transfers.js";
import { registerPrices } from "./prices.js";
import { registerPortfolio } from "./portfolio.js";

export function registerData(program: Command) {
  const cmd = program.command("data").description("Query blockchain data");
  registerBalance(cmd);
  registerTokens(cmd);
  registerNFTs(cmd);
  registerTransfers(cmd);
  registerPrices(cmd);
  registerPortfolio(cmd);
}
