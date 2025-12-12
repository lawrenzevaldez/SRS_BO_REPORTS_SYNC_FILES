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
    const rawFolders = Env.get("LOCAL_FOLDERS") || "";

    // Split safely, remove empty & normalize paths
    const localFolders = rawFolders
      .split(";")
      .map((f) => f.trim().replace(/\/+$/g, "")) // remove trailing slash
      .filter((f) => f.length > 0);

    const networkFolder = Env.get("NETWORK_FOLDER");
    const logFile = Env.get("SYNC_LOG");

    await fs.ensureDir(networkFolder);
    await fs.ensureFile(logFile);

    const log = async (message) => {
      const timestamp = new Date().toISOString();
      await fs.appendFile(logFile, `[${timestamp}] ${message}\n`);
      this.info(message);
    };

    await log(`Loaded local folders: ${JSON.stringify(localFolders)}`);
    await log(`Network folder: ${networkFolder}`);

    // ===== VALIDATE EACH FOLDER =====
    for (const f of localFolders) {
      if (!fs.existsSync(f)) {
        await log(`❌ ERROR: Local folder does NOT exist → ${f}`);
      } else {
        await log(`✔ Local folder OK → ${f}`);
      }
    }

    // ===== MAKE PATH FOR NETWORK COPY =====
    const getNetworkPath = (rootFolder, filePath) => {
      const relative = path.relative(rootFolder, filePath);
      return path.join(networkFolder, relative);
    };

    // ===== SYNC FILE =====
    const syncFile = (rootFolder) => async (filePath) => {
      try {
        const destPath = getNetworkPath(rootFolder, filePath);
        await fs.ensureDir(path.dirname(destPath));
        await fs.copy(filePath, destPath);
        await log(
          `SYNCED (${rootFolder}): ${path.relative(rootFolder, filePath)}`
        );
      } catch (err) {
        await log(`ERROR syncing ${filePath}: ${err.message}`);
      }
    };

    // ===== DELETE FILE =====
    const removeFileOrDir = (rootFolder) => async (filePath) => {
      try {
        const destPath = getNetworkPath(rootFolder, filePath);

        if (await fs.pathExists(destPath)) {
          await fs.remove(destPath);
          await log(
            `REMOVED (${rootFolder}): ${path.relative(rootFolder, filePath)}`
          );
        }
      } catch (err) {
        await log(`ERROR removing ${filePath}: ${err.message}`);
      }
    };

    // ===== FULL SYNC =====
    const fullSync = async () => {
      for (const rootFolder of localFolders) {
        try {
          await log(`🔁 FULL SYNC START: ${rootFolder}`);

          const entries = await fs.readdir(rootFolder);

          for (const e of entries) {
            const fullPath = path.join(rootFolder, e);
            const stats = await fs.stat(fullPath);

            if (stats.isDirectory()) {
              await fs.copy(fullPath, getNetworkPath(rootFolder, fullPath));
            } else {
              await syncFile(rootFolder)(fullPath);
            }
          }

          await log(`✔ FULL SYNC DONE: ${rootFolder}`);
        } catch (err) {
          await log(
            `❌ ERROR during full sync of ${rootFolder}: ${err.message}`
          );
        }
      }
    };

    await fullSync();

    // ===== WATCHERS =====
    for (const rootFolder of localFolders) {
      try {
        const watcher = chokidar.watch(rootFolder, {
          persistent: true,
          ignoreInitial: true,
          depth: 30,
        });

        watcher
          .on("add", syncFile(rootFolder))
          .on("change", syncFile(rootFolder))
          .on("unlink", removeFileOrDir(rootFolder))
          .on("addDir", syncFile(rootFolder))
          .on("unlinkDir", removeFileOrDir(rootFolder));

        await log(`👀 Watching: ${rootFolder}`);
      } catch (err) {
        await log(`❌ Failed to watch ${rootFolder}: ${err.message}`);
      }
    }

    await log("All watchers started successfully.");
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
