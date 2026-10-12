import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as glob from '@actions/glob'
import * as tc from '@actions/tool-cache'
import { HttpClient } from '@actions/http-client'
import { checksumFor, mapArch, mapOs, parsePatterns } from './util'

type ServedCli = { version: string; sha256?: Record<string, string> }

/**
 * Ask the Hibou server which CLI version it serves, and the sha256 of each
 * binary (best-effort; older servers send no checksums).
 *
 * The API wraps every payload in an `{ data: … }` envelope, so the version
 * lives one level down. Reading it from the top level silently yields
 * 'unknown', which still works but poisons the tool-cache key — every run
 * misses the cache and re-downloads the binary.
 */
async function servedCli(server: string): Promise<ServedCli> {
  try {
    const http = new HttpClient('hibou-upload-action')
    const res = await http.getJson<{ data?: ServedCli }>(`${server}/api/v1/bin/version`)
    return { version: res.result?.data?.version || 'unknown', sha256: res.result?.data?.sha256 }
  } catch {
    return { version: 'unknown' }
  }
}

async function sha256File(file: string): Promise<string> {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex')
}

/**
 * Download (and tool-cache) a version-matched hibou CLI from the server.
 * Both a cached and a downloaded binary are checked against the sha256 the
 * server reports: an integrity check (truncated download, damaged cache,
 * altering proxy), not a defence against the server itself.
 */
async function ensureCli(server: string): Promise<string> {
  const osName = mapOs(process.platform)
  const arch = mapArch(process.arch)
  const ext = osName === 'windows' ? '.exe' : ''
  const { version, sha256 } = await servedCli(server)
  const expected = checksumFor(sha256, osName, arch)
  if (!expected) {
    core.info('The server reports no CLI checksum; the binary is not verified.')
  }

  const cached = tc.find('hibou', version, arch)
  if (cached) {
    const bin = path.join(cached, `hibou${ext}`)
    if (!expected || (await sha256File(bin)) === expected) {
      core.info(`Using cached hibou ${version} at ${bin}`)
      return bin
    }
    core.warning(`Cached hibou ${version} does not match the server's sha256; downloading it again.`)
  }

  core.info(`Downloading hibou ${version} (${osName}/${arch}) from ${server}`)
  const downloaded = await tc.downloadTool(`${server}/api/v1/bin/${osName}/${arch}`)
  if (expected) {
    const actual = await sha256File(downloaded)
    if (actual !== expected) {
      throw new Error(`downloaded hibou CLI sha256 ${actual} does not match the server's ${expected}`)
    }
  }
  await fs.chmod(downloaded, 0o755)
  const dir = await tc.cacheFile(downloaded, `hibou${ext}`, 'hibou', version, arch)
  const bin = path.join(dir, `hibou${ext}`)
  core.info(`Installed hibou ${version} at ${bin}`)
  return bin
}

/** Explicit CI-context overrides; the CLI auto-detects anything omitted. */
function contextFlags(): string[] {
  const flags: string[] = []
  const map: Array<[string, string]> = [
    ['org', '--org'],
    ['repo', '--repo'],
    ['ref', '--ref'],
    ['sha', '--sha'],
  ]
  for (const [input, flag] of map) {
    const value = core.getInput(input)
    if (value) {
      flags.push(flag, value)
    }
  }
  return flags
}

async function run(): Promise<void> {
  const server = core.getInput('server', { required: true }).replace(/\/+$/, '')
  const token = core.getInput('token', { required: true })
  const fileInput = core.getInput('file')
  const complete = core.getInput('complete') || 'true'
  const expect = core.getInput('expect') || '0'
  const reachability = core.getInput('reachability') || 'false'
  const workingDirectory = core.getInput('working-directory')
  const runsReachability = Boolean(reachability) && reachability !== 'false'

  const runsScan = core.getBooleanInput('scan')
  if (!fileInput && !runsReachability && !runsScan) {
    throw new Error('`file` is required unless the step only runs `reachability` or `scan`')
  }

  const bin = await ensureCli(server)
  const env = { ...process.env, HIBOU_SERVER: server, HIBOU_TOKEN: token }

  // A reachability-only step attaches verdicts to the snapshot an earlier
  // upload step created — no files to send.
  if (fileInput) {
    const globber = await glob.create(parsePatterns(fileInput).join('\n'), {
      matchDirectories: false,
    })
    const files = await globber.glob()
    if (files.length === 0) {
      throw new Error('no files found matching the provided pattern(s)')
    }
    core.info(`Uploading ${files.length} file(s) to ${server}`)

    const uploadArgs = ['upload', ...files, ...contextFlags()]
    if (complete === 'false' || runsScan) {
      uploadArgs.push('--complete=false')
    }
    if (expect && expect !== '0') {
      uploadArgs.push(`--expect=${expect}`)
    }
    await exec.exec(bin, uploadArgs, { env })
  }

  // ADR-035: run the bundled scanners hibou plans for this commit. Uploads
  // above leave the snapshot open (complete: false) when scan also runs.
  if (runsScan) {
    const scanArgs = ['scan', ...contextFlags()]
    for (const scanner of parsePatterns(core.getInput('scanners').replace(/,/g, '\n'))) {
      scanArgs.push('--scanner', scanner)
    }
    if (complete === 'false') {
      scanArgs.push('--no-complete')
    }
    if (workingDirectory) {
      scanArgs.push('--source-root', workingDirectory)
    }
    await exec.exec(bin, scanArgs, { env })
  }

  if (runsReachability) {
    // Entries are `lang` or `lang:dir` (e.g. `go:go,java:java/target/classes`)
    // — each language analyzes its own module directory. A bare `lang` uses
    // `working-directory`, else the workspace root.
    for (const entry of parsePatterns(reachability.replace(/,/g, '\n'))) {
      const [lang, dir] = entry.split(':', 2)
      const target = dir || workingDirectory
      core.info(`Reachability analysis: ${lang} in ${target || '.'}`)
      const analyzeArgs = ['analyze', 'reachability', '--lang', lang, ...contextFlags()]
      if (target) {
        analyzeArgs.push('--dir', target)
      }
      await exec.exec(bin, analyzeArgs, { env })
    }
  }
}

run().catch((err) => core.setFailed(err instanceof Error ? err.message : String(err)))
