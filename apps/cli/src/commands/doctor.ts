import { Command } from "commander";
import { printJSON, isJSONMode } from "../lib/output.js";
import {
  SETUP_CAPABILITY_LABELS,
  SETUP_CAPABILITY_ORDER,
  getSetupStatus,
  type CapabilityStatus,
  type SetupCapabilities,
  type SetupCapability,
  type SetupMethod,
  type SetupStatus,
} from "../lib/onboarding.js";
import { load as loadConfig } from "../lib/config.js";
import { printKeyValue, green, dim } from "../lib/ui.js";

type DoctorSetupCapability = Exclude<SetupCapability, "x402">;
type DoctorSetupMethod = Exclude<SetupMethod, "x402_wallet">;
type DoctorSetupCapabilities = Omit<SetupCapabilities, "x402">;
type DoctorSetupStatus = Omit<SetupStatus, "satisfiedBy" | "capabilities"> & {
  satisfiedBy: DoctorSetupMethod | null;
  capabilities: DoctorSetupCapabilities;
};

const DOCTOR_SETUP_CAPABILITY_ORDER: DoctorSetupCapability[] =
  SETUP_CAPABILITY_ORDER.filter(
    (capability): capability is DoctorSetupCapability => capability !== "x402",
  );

function removeX402SetupMissing(missing: string[]): string[] {
  return missing.map((item) =>
    item.replace(" OR SIWx wallet", "").replace(" or x402 wallet", ""),
  );
}

function removeX402NextCommands(commands: string[]): string[] {
  return commands.filter((command) => !/x402|siwx/i.test(command));
}

function sanitizeCapabilityStatus(status: CapabilityStatus): CapabilityStatus {
  if (status.satisfiedBy !== "x402_wallet") {
    return {
      ...status,
      missing: removeX402SetupMissing(status.missing),
      nextCommands: removeX402NextCommands(status.nextCommands),
    };
  }

  return {
    complete: false,
    satisfiedBy: null,
    missing: ["api-key"],
    nextCommands: ["alchemy config set app", "alchemy config set api-key <key>"],
  };
}

function doctorSetupStatus(setup: SetupStatus): DoctorSetupStatus {
  const { x402: _x402, ...capabilities } = setup.capabilities;
  const sanitizedCapabilities = Object.fromEntries(
    Object.entries(capabilities).map(([capability, status]) => [
      capability,
      sanitizeCapabilityStatus(status),
    ]),
  ) as DoctorSetupCapabilities;
  const x402OnlySetup = setup.satisfiedBy === "x402_wallet";

  return {
    ...setup,
    complete: x402OnlySetup ? false : setup.complete,
    satisfiedBy: x402OnlySetup
      ? null
      : (setup.satisfiedBy as DoctorSetupMethod | null),
    missing: x402OnlySetup
      ? ["Provide one auth path: alchemy auth OR api-key"]
      : removeX402SetupMissing(setup.missing),
    nextCommands: x402OnlySetup
      ? [
          "alchemy auth",
          "alchemy config set app",
        ]
      : removeX402NextCommands(setup.nextCommands),
    capabilities: sanitizedCapabilities,
  };
}

export function registerDoctor(program: Command) {
  program
    .command("doctor")
    .description("Run readiness checks and print suggested fixes")
    .action(() => {
      const setup = doctorSetupStatus(getSetupStatus(loadConfig()));
      const payload = {
        ok: setup.complete,
        checks: {
          setup,
          capabilities: setup.capabilities,
        },
      };

      if (isJSONMode()) {
        printJSON(payload);
        return;
      }

      printKeyValue([
        ["Setup", setup.complete ? green("complete") : dim("incomplete")],
        ["Satisfied By", setup.satisfiedBy ?? dim("none")],
        ["Missing", setup.missing.length > 0 ? setup.missing.join(", ") : dim("none")],
      ]);

      if (setup.nextCommands.length > 0) {
        console.log("");
        console.log("  Suggested next commands:");
        for (const command of setup.nextCommands) {
          console.log(`  ${command}`);
        }
      }

      console.log("");
      console.log(`  ${dim("Capabilities:")}`);
      printKeyValue(
        DOCTOR_SETUP_CAPABILITY_ORDER.map((capability) => {
          const status = setup.capabilities[capability];
          const value = status.complete
            ? green(`ready${status.satisfiedBy ? ` (${status.satisfiedBy})` : ""}`)
            : dim(`missing ${status.missing.join(", ")}`);
          return [SETUP_CAPABILITY_LABELS[capability], value];
        }),
      );
    });
}
