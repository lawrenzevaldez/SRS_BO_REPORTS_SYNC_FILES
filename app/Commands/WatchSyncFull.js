'use strict'

const { Command } = require('@adonisjs/ace')
const Env = use('Env')
const chokidar = require('chokidar')
const fs = require('fs-extra')
const path = require('path')

class WatchSyncFull extends Command {
  static get signature () {
    return 'watch:syncfull'
  }

  static get description () {
    return 'Watch local folder and auto-sync to network folder recursively with safe deletion'
  }

  async handle () {
    // ===== CONFIG =====
    const localFolder = Env.get('LOCAL_FOLDER')
    const networkFolder = Env.get('NETWORK_FOLDER')
    const logFile = Env.get('SYNC_LOG')

    await fs.ensureDir(networkFolder)
    await fs.ensureFile(logFile)

    const log = async (message) => {
      const timestamp = new Date().toISOString()
      await fs.appendFile(logFile, `[${timestamp}] ${message}\n`)
      this.info(message)
    }

    log(`Watching local folder: ${localFolder}`)
    log(`Syncing to network folder: ${networkFolder}`)

    // ===== HELPER FUNCTIONS =====
    const getNetworkPath = (filePath) => {
      const relative = path.relative(localFolder, filePath)
      return path.join(networkFolder, relative)
    }

    const syncFile = async (filePath) => {
      try {
        const destPath = getNetworkPath(filePath)
        await fs.ensureDir(path.dirname(destPath))
        await fs.copy(filePath, destPath)
        await log(`SYNCED: ${path.relative(localFolder, filePath)}`)
      } catch (err) {
        await log(`ERROR syncing ${filePath}: ${err.message}`)
      }
    }

    // ===== SAFE DELETE FUNCTION =====
    const removeFileOrDir = async (filePath) => {
      try {
        const destPath = getNetworkPath(filePath)
        const parentLocal = path.dirname(filePath)

        // Only delete if parent folder exists locally
        if (!fs.existsSync(parentLocal)) {
          await log(`SKIPPED deletion (parent folder missing locally): ${filePath}`)
          return
        }

        if (await fs.pathExists(destPath)) {
          await fs.remove(destPath)
          await log(`REMOVED: ${path.relative(localFolder, filePath)}`)
        }
      } catch (err) {
        await log(`ERROR removing ${filePath}: ${err.message}`)
      }
    }

    // ===== INITIAL FULL SYNC =====
    const fullSync = async () => {
      const files = await fs.readdir(localFolder)
      for (const f of files) {
        const fullPath = path.join(localFolder, f)
        const stats = await fs.stat(fullPath)
        if (stats.isDirectory()) {
          await fs.copy(fullPath, getNetworkPath(fullPath))
        } else {
          await syncFile(fullPath)
        }
      }
      await log('Initial full sync completed.')
    }

    await fullSync()

    // ===== SETUP WATCHER =====
    const watcher = chokidar.watch(localFolder, {
      persistent: true,
      ignoreInitial: true,
      depth: 20,
    })

    watcher
      .on('add', syncFile)
      .on('change', syncFile)
      .on('unlink', removeFileOrDir)
      .on('addDir', syncFile)
      .on('unlinkDir', removeFileOrDir)

    await log('Real-time watching started (safe deletion enabled)...')
    process.stdin.resume()
  }
}

module.exports = WatchSyncFull
