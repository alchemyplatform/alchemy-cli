import { Command } from "commander";

function getDescription(cmd: Command): string {
  try {
    return typeof cmd.description === "function" ? cmd.description() : String(cmd.description || "");
  } catch {
    return "";
  }
}

function collectCommands(cmd: Command, prefix: string[] = []): Array<{ path: string[]; description: string }> {
  const results: Array<{ path: string[]; description: string }> = [];
  for (const sub of cmd.commands) {
    const path = [...prefix, sub.name()];
    results.push({ path, description: getDescription(sub) });
    results.push(...collectCommands(sub, path));
  }
  return results;
}

function generateBash(program: Command): string {
  const commands = collectCommands(program);
  const topLevel = program.commands.map((c) => c.name()).join(" ");

  const cases = commands
    .filter((c) => c.path.length === 1)
    .map((c) => {
      const subs = commands
        .filter((s) => s.path.length === 2 && s.path[0] === c.path[0])
        .map((s) => s.path[1]);
      if (subs.length === 0) return "";
      return `      ${c.path[0]}) COMPREPLY=($(compgen -W "${subs.join(" ")}" -- "$cur")) ;;`;
    })
    .filter(Boolean)
    .join("\n");

  return `# bash completion for alchemy CLI
# Add to ~/.bashrc: eval "$(alchemy completions bash)"
_alchemy_completions() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=($(compgen -W "${topLevel}" -- "$cur"))
    return
  fi

  case "$prev" in
${cases}
      -n|--network) COMPREPLY=() ;;
      *) COMPREPLY=() ;;
  esac
}
complete -F _alchemy_completions alchemy
`;
}

function generateZsh(program: Command): string {
  const commands = collectCommands(program);
  const topLevel = program.commands
    .map((c) => `'${c.name()}:${getDescription(c).replace(/'/g, "'\\''")}'`)
    .join("\n      ");

  const subcommandCases = commands
    .filter((c) => c.path.length === 1)
    .map((c) => {
      const subs = commands
        .filter((s) => s.path.length === 2 && s.path[0] === c.path[0])
        .map((s) => `'${s.path[1]}:${s.description.replace(/'/g, "'\\''")}'`);
      if (subs.length === 0) return "";
      return `    ${c.path[0]})\n      _values 'subcommand' \\\n        ${subs.join(" \\\n        ")}\n      ;;`;
    })
    .filter(Boolean)
    .join("\n");

  return `#compdef alchemy
# zsh completion for alchemy CLI
# Add to ~/.zshrc: eval "$(alchemy completions zsh)"
_alchemy() {
  local -a commands
  if (( CURRENT == 2 )); then
    commands=(
      ${topLevel}
    )
    _describe 'command' commands
    return
  fi

  case "$words[2]" in
${subcommandCases}
  esac
}
_alchemy "$@"
compdef _alchemy alchemy
`;
}

function generateFish(program: Command): string {
  const commands = collectCommands(program);

  const lines = commands.map((c) => {
    const desc = c.description.replace(/'/g, "\\'");
    if (c.path.length === 1) {
      return `complete -c alchemy -n '__fish_use_subcommand' -a '${c.path[0]}' -d '${desc}'`;
    }
    if (c.path.length === 2) {
      return `complete -c alchemy -n '__fish_seen_subcommand_from ${c.path[0]}' -a '${c.path[1]}' -d '${desc}'`;
    }
    return "";
  }).filter(Boolean);

  return `# fish completion for alchemy CLI
# Add to ~/.config/fish/completions/alchemy.fish
${lines.join("\n")}
`;
}

export function registerCompletions(program: Command) {
  program
    .command("completions")
    .argument("<shell>", "Shell type: bash, zsh, or fish")
    .description("Generate shell completion scripts")
    .addHelpText(
      "after",
      `
Examples:
  alchemy completions bash >> ~/.bashrc
  eval "$(alchemy completions zsh)"
  alchemy completions fish > ~/.config/fish/completions/alchemy.fish`,
    )
    .action((shell: string) => {
      switch (shell.toLowerCase()) {
        case "bash":
          process.stdout.write(generateBash(program));
          break;
        case "zsh":
          process.stdout.write(generateZsh(program));
          break;
        case "fish":
          process.stdout.write(generateFish(program));
          break;
        default:
          console.error(`Unknown shell: ${shell}. Supported: bash, zsh, fish`);
          process.exit(2);
      }
    });
}
