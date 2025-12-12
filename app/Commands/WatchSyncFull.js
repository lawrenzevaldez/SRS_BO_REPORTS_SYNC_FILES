"use strict";

const { Command } = require("@adonisjs/ace");
const Env = use("Env");
const chokidar = require("chokidar");
const fs = require("fs-extra");
const path = require("path");

class WatchSyncFull extends Command {
  static get signature() {
    return "watch:syncfull";
  }

  static get description() {
    return "Watch local folder and auto-sync to network folder recursively with safe deletion";
  }

  async handle() {
    // ===== CONFIG =====
    const localFolders = (Env.get("LOCAL_FOLDER") || "")
      .split(";")
      .map((f) => f.trim())
      .filter((f) => f.length > 0); // remove empty entries

    const networkFolder = Env.get("NETWORK_FOLDER");
    const logFile = Env.get("SYNC_LOG");

    await fs.ensureDir(networkFolder);
    await fs.ensureFile(logFile);

    const log = async (message) => {
      const timestamp = new Date().toISOString();
      await fs.appendFile(logFile, `[${timestamp}] ${message}\n`);
      this.info(message);
    };

    await log(`Watching local folders: ${localFolders.join(", ")}`);
    await log(`Syncing to network folder: ${networkFolder}`);

    // ===== GET NETWORK DESTINATION PATH =====
    const getNetworkPath = (rootFolder, filePath) => {
      const relative = path.relative(rootFolder, filePath);
      return path.join(networkFolder, relative);
    };

    // ===== SYNC FILE FUNCTION =====
    const syncFile = (rootFolder) => async (filePath) => {
      try {
        const destPath = getNetworkPath(rootFolder, filePath);
        await fs.ensureDir(path.dirname(destPath));
        await fs.copy(filePath, destPath);
        await log(
          `SYNCED: (${rootFolder}) ${path.relative(rootFolder, filePath)}`
        );
      } catch (err) {
        await log(`ERROR syncing ${filePath}: ${err.message}`);
      }
    };

    // ===== SAFE DELETE FUNCTION =====
    const removeFileOrDir = (rootFolder) => async (filePath) => {
      try {
        const destPath = getNetworkPath(rootFolder, filePath);
        const parentLocal = path.dirname(filePath);

        if (!fs.existsSync(parentLocal)) {
          await log(
            `SKIPPED deletion (parent folder missing locally): ${filePath}`
          );
          return;
        }

        if (await fs.pathExists(destPath)) {
          await fs.remove(destPath);
          await log(
            `REMOVED: (${rootFolder}) ${path.relative(rootFolder, filePath)}`
          );
        }
      } catch (err) {
        await log(`ERROR removing ${filePath}: ${err.message}`);
      }
    };

    // ===== INITIAL FULL SYNC FOR ALL FOLDERS =====
    const fullSync = async () => {
      for (const rootFolder of localFolders) {
        const entries = await fs.readdir(rootFolder);

        for (const e of entries) {
          const fullPath = path.join(rootFolder, e);
          const stats = await fs.stat(fullPath);
          const destPath = getNetworkPath(rootFolder, fullPath);

          if (stats.isDirectory()) {
            await fs.copy(fullPath, destPath);
          } else {
            await syncFile(rootFolder)(fullPath);
          }
        }
      }

      await log("Initial full sync completed for all folders.");
    };

    await fullSync();

    // ===== SETUP WATCHERS PER FOLDER =====
    for (const rootFolder of localFolders) {
      const watcher = chokidar.watch(rootFolder, {
        persistent: true,
        ignoreInitial: true,
        depth: 20,
      });

      watcher
        .on("add", syncFile(rootFolder))
        .on("change", syncFile(rootFolder))
        .on("unlink", removeFileOrDir(rootFolder))
        .on("addDir", syncFile(rootFolder))
        .on("unlinkDir", removeFileOrDir(rootFolder));

      await log(`Real-time watching started for: ${rootFolder}`);
    }

    await log("Watching all folders (safe deletion enabled)...");
    process.stdin.resume();
  }

  // async handle() {
  //   // ===== CONFIG =====
  //   const localFolder = Env.get("LOCAL_FOLDER");
  //   const networkFolder = Env.get("NETWORK_FOLDER");
  //   const logFile = Env.get("SYNC_LOG");

  //   await fs.ensureDir(networkFolder);
  //   await fs.ensureFile(logFile);

  //   const log = async (message) => {
  //     const timestamp = new Date().toISOString();
  //     await fs.appendFile(logFile, `[${timestamp}] ${message}\n`);
  //     this.info(message);
  //   };

  //   log(`Watching local folder: ${localFolder}`);
  //   log(`Syncing to network folder: ${networkFolder}`);

  //   // ===== HELPER FUNCTIONS =====
  //   const getNetworkPath = (filePath) => {
  //     const relative = path.relative(localFolder, filePath);
  //     return path.join(networkFolder, relative);
  //   };

  //   const syncFile = async (filePath) => {
  //     try {
  //       const destPath = getNetworkPath(filePath);
  //       await fs.ensureDir(path.dirname(destPath));
  //       await fs.copy(filePath, destPath);
  //       await log(`SYNCED: ${path.relative(localFolder, filePath)}`);
  //     } catch (err) {
  //       await log(`ERROR syncing ${filePath}: ${err.message}`);
  //     }
  //   };

  //   // ===== SAFE DELETE FUNCTION =====
  //   const removeFileOrDir = async (filePath) => {
  //     try {
  //       const destPath = getNetworkPath(filePath);
  //       const parentLocal = path.dirname(filePath);

  //       // Only delete if parent folder exists locally
  //       if (!fs.existsSync(parentLocal)) {
  //         await log(
  //           `SKIPPED deletion (parent folder missing locally): ${filePath}`
  //         );
  //         return;
  //       }

  //       if (await fs.pathExists(destPath)) {
  //         await fs.remove(destPath);
  //         await log(`REMOVED: ${path.relative(localFolder, filePath)}`);
  //       }
  //     } catch (err) {
  //       await log(`ERROR removing ${filePath}: ${err.message}`);
  //     }
  //   };

  //   // ===== INITIAL FULL SYNC =====
  //   const fullSync = async () => {
  //     const files = await fs.readdir(localFolder);
  //     for (const f of files) {
  //       const fullPath = path.join(localFolder, f);
  //       const stats = await fs.stat(fullPath);
  //       if (stats.isDirectory()) {
  //         await fs.copy(fullPath, getNetworkPath(fullPath));
  //       } else {
  //         await syncFile(fullPath);
  //       }
  //     }
  //     await log("Initial full sync completed.");
  //   };

  //   await fullSync();

  //   // ===== SETUP WATCHER =====
  //   const watcher = chokidar.watch(localFolder, {
  //     persistent: true,
  //     ignoreInitial: true,
  //     depth: 20,
  //   });

  //   watcher
  //     .on("add", syncFile)
  //     .on("change", syncFile)
  //     .on("unlink", removeFileOrDir)
  //     .on("addDir", syncFile)
  //     .on("unlinkDir", removeFileOrDir);

  //   await log("Real-time watching started (safe deletion enabled)...");
  //   process.stdin.resume();
  // }
}

module.exports = WatchSyncFull;
