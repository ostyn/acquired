/**
 * CLI entrypoint for deterministic Monte Carlo-vs-random benchmarking.
 *
 * Example:
 * yarn bot:benchmark --matches=50 --rolloutBudget=96 --rootActionCap=32 --maxRolloutSteps=120
 */

import { runMonteCarloVsRandomBenchmark } from '../src/game/engine/bot-benchmark';

type ParsedArgs = {
  help: boolean;
  matches?: number;
  seedBase?: number;
  seedStep?: number;
  maxActionsPerMatch?: number;
  rootActionCap?: number;
  rolloutBudget?: number;
  maxRolloutSteps?: number;
  alternateSeats?: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }
    if (!token.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineRawValue] = token.slice(2).split('=');
    const hasInlineValue = typeof inlineRawValue !== 'undefined';
    const nextToken = argv[index + 1];
    const rawValue = hasInlineValue
      ? inlineRawValue
      : nextToken && !nextToken.startsWith('--')
        ? nextToken
        : '';

    if (!hasInlineValue && nextToken && !nextToken.startsWith('--')) {
      index += 1;
    }

    switch (rawKey) {
      case 'matches':
        parsed.matches = parseIntegerFlag(rawKey, rawValue);
        break;
      case 'seedBase':
        parsed.seedBase = parseIntegerFlag(rawKey, rawValue);
        break;
      case 'seedStep':
        parsed.seedStep = parseIntegerFlag(rawKey, rawValue);
        break;
      case 'maxActionsPerMatch':
        parsed.maxActionsPerMatch = parseIntegerFlag(rawKey, rawValue);
        break;
      case 'rootActionCap':
        parsed.rootActionCap = parseIntegerFlag(rawKey, rawValue);
        break;
      case 'rolloutBudget':
        parsed.rolloutBudget = parseIntegerFlag(rawKey, rawValue);
        break;
      case 'maxRolloutSteps':
        parsed.maxRolloutSteps = parseIntegerFlag(rawKey, rawValue);
        break;
      case 'alternateSeats':
        parsed.alternateSeats = parseBooleanFlag(rawValue);
        break;
      default:
        throw new Error(`Unknown flag: --${rawKey}`);
    }
  }

  return parsed;
}

function parseIntegerFlag(name: string, rawValue: string): number {
  const number = Number(rawValue);
  if (!Number.isInteger(number)) {
    throw new Error(`Expected integer for --${name}, got "${rawValue}".`);
  }
  return number;
}

function parseBooleanFlag(rawValue: string): boolean {
  const value = String(rawValue || '').trim().toLowerCase();
  if (value === '' || value === 'true' || value === '1' || value === 'yes') {
    return true;
  }
  if (value === 'false' || value === '0' || value === 'no') {
    return false;
  }
  throw new Error(`Expected boolean for --alternateSeats, got "${rawValue}".`);
}

function printHelp() {
  console.log('Usage: yarn bot:benchmark [options]');
  console.log('');
  console.log('Options:');
  console.log('  --matches=<int>             Number of matches (default: 20)');
  console.log('  --seedBase=<int>            Seed base value (default: 1000)');
  console.log('  --seedStep=<int>            Seed increment per match (default: 97)');
  console.log('  --maxActionsPerMatch=<int>  Per-match safety cap (default: 5000)');
  console.log('  --rootActionCap=<int>       Monte Carlo root action cap (default: 24)');
  console.log('  --rolloutBudget=<int>       Monte Carlo rollout budget (default: 64)');
  console.log('  --maxRolloutSteps=<int>     Monte Carlo max rollout depth (default: 80)');
  console.log('  --alternateSeats=<bool>     Alternate Monte Carlo seat p1/p2 (default: true)');
  console.log('  --help                      Show this message');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const result = runMonteCarloVsRandomBenchmark({
    matchCount: args.matches,
    seedBase: args.seedBase,
    seedStep: args.seedStep,
    maxActionsPerMatch: args.maxActionsPerMatch,
    alternateSeats: args.alternateSeats,
    monteCarloConfig: {
      rootActionCap: args.rootActionCap,
      rolloutBudget: args.rolloutBudget,
      maxRolloutSteps: args.maxRolloutSteps,
    },
  });

  console.log(`Matches: ${result.matchCount}`);
  console.log(`Monte Carlo wins: ${result.monteCarloWins}`);
  console.log(`Monte Carlo ties: ${result.monteCarloTies}`);
  console.log(`Monte Carlo losses: ${result.monteCarloLosses}`);
  console.log(`Win rate (strict): ${(result.winRate * 100).toFixed(1)}%`);
  console.log(`Score rate (ties fractional): ${(result.scoreRate * 100).toFixed(1)}%`);
  console.log(
    `Monte Carlo config: rootActionCap=${result.monteCarloConfig.rootActionCap}, rolloutBudget=${result.monteCarloConfig.rolloutBudget}, maxRolloutSteps=${result.monteCarloConfig.maxRolloutSteps}`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
