import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { NvmInfo } from '../shared/types'

const pexec = promisify(execFile)

/** 读取本机 nvm 环境（nvm-windows）；未安装返回 installed=false */
export async function nvmList(): Promise<NvmInfo> {
  try {
    const { stdout } = await pexec('nvm', ['list'], { windowsHide: true })
    const versions = [...stdout.matchAll(/(\d+\.\d+\.\d+)/g)].map((m) => m[1])
    const current = stdout.match(/\*\s+(\d+\.\d+\.\d+)/)?.[1] ?? null
    return { installed: versions.length > 0, versions: [...new Set(versions)], current }
  } catch {
    return { installed: false, versions: [], current: null }
  }
}
