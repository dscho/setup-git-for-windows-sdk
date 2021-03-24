import * as core from '@actions/core'
import process from 'process'
import {get} from './src/downloader'
import {restoreCache, saveCache} from '@actions/cache'

async function run(): Promise<void> {
  try {
    if (process.platform !== 'win32') {
      core.warning(
        `Skipping this Action because it only works on Windows, not on ${process.platform}`
      )
      return
    }
    const flavor = core.getInput('flavor')
    const architecture = core.getInput('architecture')
    const verbose = core.getInput('verbose')

    const {artifactName, download, id} = await get(flavor, architecture)
    const outputDirectory =
      core.getInput('path') ||
      (artifactName === 'compat' ? 'compat/' : `C:/${artifactName}`)
    let useCache: boolean
    switch (core.getInput('cache')) {
      case 'true':
        useCache = true
        break
      case 'auto':
        useCache = flavor !== 'full'
        break
      default:
        useCache = false
    }

    let needToDownload = true
    try {
      if (useCache && (await restoreCache([outputDirectory], id))) {
        core.info(`Cached ${id} was successfully restored`)
        needToDownload = false
      }
    } catch (e) {
      core.warning(`Cannot use @actions/cache (${e})`)
      useCache = false
    }

    if (needToDownload) {
      core.info(`Downloading ${artifactName}`)
      await download(
        outputDirectory,
        verbose.match(/^\d+$/) ? parseInt(verbose) : verbose === 'true'
      )

      try {
        if (useCache && !(await saveCache([outputDirectory], id))) {
          core.warning(`Failed to cache ${id}`)
        }
      } catch (e) {
        core.warning(`Failed to cache ${id}: ${e.message}`)
      }
    }

    if (artifactName === 'compat') {
      // The `vcpkg` artifacts do not need the `PATH` to be modified
      return
    }

    // Set up PATH so that Git for Windows' SDK's `bash.exe`, `prove` and `gcc` are found
    core.addPath(`${outputDirectory}/usr/bin/core_perl`)
    core.addPath(`${outputDirectory}/usr/bin`)
    const msystem = architecture === 'i686' ? 'MINGW32' : 'MINGW64'
    core.addPath(`${outputDirectory}/${msystem.toLocaleLowerCase()}/bin`)
    core.exportVariable('MSYSTEM', msystem)
    if (
      !('LANG' in process.env) &&
      !('LC_ALL' in process.env) &&
      !('LC_CTYPE' in process.env)
    ) {
      core.exportVariable('LC_CTYPE', 'C.UTF-8')
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
