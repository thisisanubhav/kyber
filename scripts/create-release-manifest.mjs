import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const target = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(target))
    else files.push(target)
  }
  return files
}

async function artifact(directory) {
  const files = (await filesUnder(directory)).sort()
  const digest = createHash('sha256')
  let bytes = 0
  for (const file of files) {
    const content = await readFile(file)
    digest.update(file.slice(directory.length)).update('\0').update(content)
    bytes += content.length
  }
  return { sha256: digest.digest('hex'), files: files.length, bytes }
}

function gitValue(args, fallback = 'unknown') {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim() || fallback
  } catch {
    return fallback
  }
}

const root = process.cwd()
const manifest = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  revision: gitValue(['rev-parse', 'HEAD']),
  branch: gitValue(['branch', '--show-current']),
  dirty: Boolean(gitValue(['status', '--porcelain'], '')),
  node: process.version,
  artifacts: {
    website: await artifact(resolve(root, 'website/dist')),
    app: await artifact(resolve(root, 'app/dist')),
    backend: await artifact(resolve(root, 'backend/dist')),
  },
}

console.log(JSON.stringify(manifest, null, 2))
