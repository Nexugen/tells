#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fails, lint } from './lint.ts';
import { creditLine, formatGithub, formatText } from './format.ts';
import { rewrite } from './rewrite.ts';
import { rulesAsJson } from './serialize.ts';
import { RULES } from './rules.ts';
import { EXEMPLARS } from './exemplars.ts';
import { REGISTERS, type LintOptions, type Register, type Severity } from './types.ts';
import { anthropic, claudeCli } from './model.ts';
import { buildVoice, checkVoice, splitSamples, styleMatch, type VoiceProfile } from './voice.ts';

const VERSION = '0.4.1';

const HELP = `tells ${VERSION}: find the habits that make text read as AI-written

Usage
  tells lint [files or folders...]     check text, no model, no network (stdin if no files)
  tells rewrite <file|->               fix only the flagged sentences with a model
  tells voice build <files...> -o v.json  learn a writer's voice from samples of their writing
  tells voice show <v.json>             print the habits a voice profile found
  tells voice match <v.json> <file|->   how close a text is to a voice (0 to 100)
  tells rules [--json]                 list the rules
  tells exemplars [--register r]       list the human examples and their licences

Lint options
  --register <r>     auto | casual | professional | technical | marketing (default auto: picked from the text)
  --format <f>       text | json | github (default text)
  --ci               exit 1 when the check fails (see --fail-on and --max-score)
  --fail-on <s>      error | warning | info (default error)
  --max-score <n>    also fail when known tells per 100 words is above n
  --disable <ids>    comma-separated rule ids to skip
  --plain            treat input as plain text, not markdown
  --strict           report every rule at its own severity, without corroboration
                     (by default one habit alone is a hint; see README)
  --no-score         skip the human-pattern score
  --quiet            print only files with findings, and nothing else

Rewrite options
  --register <r>     as above
  --write            write the result back to the file
  --min-severity <s> lowest severity to fix (default warning)
  --backend <name>   anthropic (ANTHROPIC_API_KEY) or cli (the Claude Code CLI, claude -p
                     with no tools). Default anthropic, or TELLS_MODEL_BACKEND
  --model <id>       model id (default claude-haiku-5-5 for anthropic, haiku for cli)
  --json             print the full result as JSON
  --voice <v.json>   rewrite the whole draft in this voice, keeping every fact, then fix
                     what still carries a tell (see tells voice build)
  --polish           with --voice: standard capitals, apostrophes and spelling

Voice options
  -o, --out <file>   where voice build writes the profile (default stdout)
  --name <name>      a label stored in the profile
  Each file is one sample. A file can hold several, separated by lines of ---,
  or be a JSON array of strings, or JSONL with a "text" field per line.
  Aim for 10 or more samples and 1,500 words or more. Nothing leaves your machine.

Config
  A .tellsrc.json in the current folder can set register, disable, severity,
  failOn, maxScore, minSeverity, corroborate and guidance. Flags win over the file.
  Put "tells-ignore" on a line, or wrap a block in <!-- tells-off --> and
  <!-- tells-on -->, to skip it.

Exit codes: 0 ok, 1 check failed (with --ci) or rewrite error, 2 bad usage.`;

interface Config extends LintOptions {
  failOn?: Severity;
  maxScore?: number;
  minSeverity?: Severity;
  guidance?: string;
}

function parse(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-') rest.push(a);
    else if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      const bool = ['ci', 'json', 'write', 'plain', 'help', 'version', 'no-color', 'strict', 'no-score', 'quiet', 'polish'];
      if (v !== undefined) flags[k] = v;
      else if (bool.includes(k)) flags[k] = true;
      else flags[k] = argv[++i] ?? '';
    } else if (a === '-h') flags.help = true;
    else if (a === '-o') flags.out = argv[++i] ?? '';
    else rest.push(a);
  }
  return { flags, rest };
}

function usage(msg: string): never {
  process.stderr.write(`tells: ${msg}\nRun tells --help for usage.\n`);
  process.exit(2);
}

function loadConfig(): Config {
  const p = resolve('.tellsrc.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Config;
  } catch (err) {
    usage(`could not read .tellsrc.json: ${(err as Error).message}`);
  }
}

function asRegister(v: unknown): Register | 'auto' | undefined {
  if (v === undefined || v === 'auto') return v;
  if (!REGISTERS.includes(v as Register)) usage(`unknown register "${String(v)}" (use ${REGISTERS.join(', ')})`);
  return v as Register;
}

function asSeverity(v: unknown, name: string): Severity | undefined {
  if (v === undefined) return undefined;
  if (!['error', 'warning', 'info'].includes(String(v))) usage(`${name} must be error, warning or info`);
  return v as Severity;
}

const TEXT_EXT = new Set(['.md', '.mdx', '.markdown', '.txt', '.text']);

function expand(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    if (p === '-') {
      out.push(p);
      continue;
    }
    if (!existsSync(p)) usage(`no such file: ${p}`);
    if (statSync(p).isDirectory()) {
      const walk = (d: string) => {
        for (const name of readdirSync(d)) {
          if (name === 'node_modules' || name.startsWith('.')) continue;
          const full = join(d, name);
          if (statSync(full).isDirectory()) walk(full);
          else if (TEXT_EXT.has(extname(name).toLowerCase())) out.push(full);
        }
      };
      walk(p);
    } else out.push(p);
  }
  return out;
}

function read(p: string): string {
  return p === '-' ? readFileSync(0, 'utf8') : readFileSync(p, 'utf8');
}

function loadVoice(path: string): VoiceProfile {
  if (!existsSync(path)) usage(`no such voice file: ${path}`);
  try {
    const v: unknown = JSON.parse(readFileSync(path, 'utf8'));
    checkVoice(v);
    return v;
  } catch (err) {
    usage(`${path}: ${(err as Error).message}`);
  }
}

/** One file as samples: a JSON array of strings, JSONL with "text", or text split on --- lines. */
function samplesFrom(name: string, raw: string): string[] {
  const t = raw.trim();
  if (name.endsWith('.json') && t.startsWith('[')) {
    const arr = JSON.parse(t) as unknown[];
    return arr.map((x) => (typeof x === 'string' ? x : typeof (x as { text?: unknown })?.text === 'string' ? (x as { text: string }).text : '')).filter(Boolean);
  }
  if (name.endsWith('.jsonl')) {
    return t.split('\n').filter((l) => l.trim()).map((l) => {
      const d = JSON.parse(l) as unknown;
      return typeof d === 'string' ? d : String((d as { text?: unknown }).text ?? '');
    }).filter(Boolean);
  }
  return splitSamples(raw);
}

async function main() {
  const { flags, rest } = parse(process.argv.slice(2));
  if (flags.version) return void console.log(VERSION);
  const cmd = rest.shift();
  if (flags.help || !cmd || cmd === 'help') return void console.log(HELP);
  const cfg = loadConfig();
  const register = asRegister(flags.register ?? cfg.register);
  const disable = [...(cfg.disable ?? []), ...(typeof flags.disable === 'string' ? flags.disable.split(',').map((s) => s.trim()).filter(Boolean) : [])];
  for (const id of disable) if (!RULES.some((r) => r.id === id)) usage(`unknown rule id "${id}"`);
  const base: LintOptions = {
    register, disable, severity: cfg.severity, plain: Boolean(flags.plain) || cfg.plain,
    corroborate: flags.strict ? 0 : cfg.corroborate, noScore: Boolean(flags['no-score']) || cfg.noScore,
  };

  if (cmd === 'lint' || cmd === 'check') {
    const files = expand(rest.length ? rest : process.stdin.isTTY ? usage('give a file, a folder, or pipe text in') : ['-']);
    const format = String(flags.format ?? 'text');
    if (!['text', 'json', 'github'].includes(format)) usage('format must be text, json or github');
    const failOn = asSeverity(flags['fail-on'] ?? cfg.failOn, '--fail-on');
    const maxScore = flags['max-score'] !== undefined ? Number(flags['max-score']) : cfg.maxScore;
    if (maxScore !== undefined && Number.isNaN(maxScore)) usage('--max-score must be a number');
    const ci = Boolean(flags.ci) || cmd === 'check';
    const color = process.stdout.isTTY && !flags['no-color'] && !process.env.NO_COLOR;
    const quiet = Boolean(flags.quiet);
    let failed = false;
    const all: unknown[] = [];
    for (const file of files) {
      const text = read(file);
      const result = lint(text, base);
      if (fails(result, { failOn, maxScore })) failed = true;
      const name = file === '-' ? '<stdin>' : file;
      if (format === 'json') all.push({ file: name, ...result });
      else if (format === 'github') {
        const out = formatGithub(name, result);
        if (out) console.log(out);
        console.log(`${name}: ${result.score} known tells per 100 words (${result.grade})`);
      } else if (!quiet || result.findings.length) console.log(formatText(name, text, result, { color }));
    }
    if (format === 'json') console.log(JSON.stringify(files.length === 1 ? all[0] : all, null, 2));
    const credit = creditLine({ format, quiet, tty: Boolean(process.stdout.isTTY), color });
    if (credit) console.log(`\n${credit}`);
    process.exitCode = ci && failed ? 1 : 0;
    return;
  }

  if (cmd === 'rewrite') {
    const file = rest[0] ?? (process.stdin.isTTY ? usage('give a file, or pipe text in') : '-');
    const text = read(file);
    const backend = typeof flags.backend === 'string' ? flags.backend : (process.env.TELLS_MODEL_BACKEND ?? 'anthropic');
    const modelId = typeof flags.model === 'string' ? flags.model : undefined;
    if (backend !== 'anthropic' && backend !== 'cli') usage('--backend is anthropic or cli');
    const model = backend === 'cli' ? claudeCli({ model: modelId, configDir: process.env.TELLS_CLI_CONFIG_DIR }) : anthropic({ model: modelId });
    try {
      const res = await rewrite(text, {
        ...base,
        model,
        voice: typeof flags.voice === 'string' ? loadVoice(flags.voice) : undefined,
        polish: Boolean(flags.polish),
        minSeverity: asSeverity(flags['min-severity'] ?? cfg.minSeverity, '--min-severity'),
        guidance: cfg.guidance,
      });
      if (flags.json) console.log(JSON.stringify(res, null, 2));
      else if (flags.write && file !== '-') {
        writeFileSync(file, res.text);
        process.stderr.write(`${file}: ${res.changes.length} sentences changed, known tells per 100 words ${res.before.score} -> ${res.after.score}\n`);
        if (res.voice) process.stderr.write(`style match ${res.voice.before.score} -> ${res.voice.after.score}\n`);
      } else if (res.voice) {
        process.stdout.write(res.text);
        const hp = (r: typeof res.before) => r.human.pattern?.score ?? '-';
        process.stderr.write(`\nstyle match ${res.voice.before.score} -> ${res.voice.after.score}, known tells per 100 words ${res.before.score} -> ${res.after.score}, human-pattern score ${hp(res.before)} -> ${hp(res.after)}, ${res.model}, ${res.calls} calls\n`);
        for (const r of res.rejected) process.stderr.write(`kept the draft unchanged: the rewrite ${r.reason}\n`);
      } else {
        process.stdout.write(res.text);
        process.stderr.write(`\n${res.changes.length} sentences changed, known tells per 100 words ${res.before.score} -> ${res.after.score}, ${res.model}, about $${res.costUsd.toFixed(4)}\n`);
        for (const sg of res.suggestions) process.stderr.write(`fill in ${sg.placeholder}: ${sg.sentence}\n`);
        if (res.rejected.length) process.stderr.write(`${res.rejected.length} edits dropped for adding facts the text did not have\n`);
      }
    } catch (err) {
      process.stderr.write(`tells: ${(err as Error).message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === 'voice') {
    const sub = rest.shift();
    if (sub === 'build') {
      if (!rest.length) usage('give the sample files: tells voice build <files...> -o voice.json');
      const samples: string[] = [];
      for (const f of expand(rest)) samples.push(...samplesFrom(f, read(f)));
      let profile: VoiceProfile;
      try {
        profile = buildVoice(samples, { name: typeof flags.name === 'string' ? flags.name : undefined, register: register === 'auto' ? undefined : register });
      } catch (err) {
        usage((err as Error).message);
      }
      const json = JSON.stringify(profile, null, 1) + '\n';
      if (typeof flags.out === 'string' && flags.out) {
        writeFileSync(flags.out, json, { mode: 0o600 });
        process.stderr.write(`${flags.out}: voice from ${profile.samples} samples, ${profile.words} words\n`);
        for (const l of profile.summary) process.stderr.write(`  ${l}\n`);
      } else process.stdout.write(json);
      return;
    }
    if (sub === 'show') {
      const v = loadVoice(rest[0] ?? usage('give a voice file'));
      if (flags.json) return void console.log(JSON.stringify(v, null, 2));
      console.log(`${v.name ? `${v.name}: ` : ''}${v.samples} samples, ${v.words} words, built ${v.createdAt}\n`);
      for (const l of v.summary) console.log(`- ${l}`);
      return;
    }
    if (sub === 'match') {
      const v = loadVoice(rest[0] ?? usage('give a voice file and a text'));
      const file = rest[1] ?? (process.stdin.isTTY ? usage('give a file, or pipe text in') : '-');
      const m = styleMatch(read(file), v, { polish: Boolean(flags.polish) });
      if (flags.json) return void console.log(JSON.stringify(m, null, 2));
      console.log(`style match ${m.score}/100 (closer to the voice than ${m.score}% of other people's texts in the baseline)${m.words < 60 ? ', short text, read loosely' : ''}`);
      console.log(`furthest from the voice: ${m.furthest.map((f) => f.label).join(', ')}`);
      return;
    }
    usage('voice commands are build, show and match');
  }

  if (cmd === 'rules') {
    if (flags.json) return void console.log(JSON.stringify(rulesAsJson(), null, 2));
    for (const r of RULES) {
      const reg = r.registers ? ` (${Object.entries(r.registers).map(([k, v]) => `${k}: ${v}`).join(', ')})` : '';
      console.log(`${r.id.padEnd(22)} ${r.severity.padEnd(8)} ${r.name}${reg}\n${''.padEnd(31)} ${r.description}`);
    }
    return;
  }

  if (cmd === 'exemplars') {
    const reg = asRegister(flags.register);
    const list = EXEMPLARS.filter((e) => !reg || reg === 'auto' || e.register === reg);
    if (flags.json) return void console.log(JSON.stringify(list, null, 2));
    for (const e of list) console.log(`${e.id} [${e.register}${e.human ? '' : ', house draft'}]\n  ${e.source.author}, ${e.source.url}\n  ${e.licence.name}\n`);
    return;
  }

  usage(`unknown command "${cmd}"`);
}

main().catch((err) => {
  process.stderr.write(`tells: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
