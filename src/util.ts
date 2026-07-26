// Pure helpers, kept separate so they are unit-testable without the Actions runtime.

/** Map a Node `process.arch` (or common aliases) to a Hibou release arch. */
export function mapArch(arch: string): string {
  switch (arch) {
    case 'x64':
    case 'x86_64':
    case 'amd64':
      return 'amd64'
    case 'arm64':
    case 'aarch64':
      return 'arm64'
    default:
      throw new Error(`unsupported architecture: ${arch}`)
  }
}

/** Map a Node `process.platform` to a Hibou release OS. */
export function mapOs(platform: string): string {
  switch (platform) {
    case 'linux':
      return 'linux'
    case 'darwin':
      return 'darwin'
    case 'win32':
      return 'windows'
    default:
      throw new Error(`unsupported OS: ${platform}`)
  }
}

/** Split a newline-separated `file` input into trimmed, non-empty glob patterns. */
export function parsePatterns(input: string): string[] {
  return input
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
