#! /usr/bin/env node
import { join, resolve } from "path";
import fs from "fs";
import inquirer from "inquirer";
import separator from "inquirer/lib/objects/separator.js";
import { spawn, execSync } from "child_process";
// capture options:
const args = processArgs();
// debug
const debug = collectOptions(args, ["--debug", "-db"]);
const noRun = collectOptions(args, ["--noRun", "-nr"]);
let noClear = collectOptions(args, ["--noClear", "-nc"]);
// options
const help = collectOptions(args, ["--help", "-h"]);
const includeDot = collectOptions(args, ["--dot"]);
//@ts-ignore
const runWithBun = !!globalThis.Bun || collectOptions(args, ["--bun"]);
const postfix = collectOptions(args, ["--postfix", "-p"], true, "tf");
const depthValue = collectOptions(args, ["--depth"], true, "10", true);
const config = collectOptions(args, ["--config", "-c"], true);
const saveLast = collectOptions(args, ["-save", "-s"], true, ".last-tf");
const saveNumber = collectOptions(args, ["-savenumber", "-sn"], true, 1, true);
const newCwd = collectOptions(args, ["--cwd", "-c"], true);
const namePath = collectOptions(args, ["--namepath", "-np"]);
// variables
let cwd = process.cwd();
let configPath = "";
let depth = 10;
// parse options:
if (debug) {
    noClear = true;
}
// depth
if (typeof depthValue === "number") {
    depth = depthValue;
    if (depth > 50) {
        depth = 50;
    }
}
// cwd
if (typeof newCwd === "string") {
    if (!fs.existsSync(newCwd)) {
        throw new Error("cwd not found: " + newCwd);
    }
    cwd = resolve(newCwd);
    process.chdir(cwd);
    if (debug) {
        console.log("cwd changed to: ", cwd);
    }
}
// config
if (typeof config === "string") {
    if (!fs.existsSync(configPath)) {
        throw new Error("tsconfig.json not found at: " + configPath);
    }
}
else {
    configPath = join(cwd, "tsconfig.json");
}
configPath = resolve(configPath);
// save last test
const lastTestFilePath = typeof saveLast === "string" ? join(cwd, saveLast) : "";
const lastTestNames = lastTestFilePath && fs.existsSync(lastTestFilePath)
    ? fs.readFileSync(lastTestFilePath, "utf8").trim().split("\n")
    : [];
// postfix
const postfixRegex = new RegExp(`\\.${postfix}\\.(js|ts)$`);
// debug
if (debug) {
    console.log("");
    console.log("-------------------------------------------");
    console.log("------------ DEBUG Parsed args ------------");
    console.log("-------------------------------------------");
    console.log("");
    console.log("run from cwd: ", process.cwd());
    console.log("");
    console.log("process args: ", args.join(" "));
    console.log("");
    console.log("-----------------------");
    console.log("");
    console.log("--help: ", help);
    console.log("--noRun: ", noRun);
    console.log("--debug: ", debug);
    console.log("--noClear: ", noClear);
    console.log("--includeDot: ", includeDot);
    console.log("--bun (runWithBun): ", runWithBun);
    console.log("--postfix: ", postfix);
    console.log("--depth: ", depth);
    console.log("--cwd: ", cwd);
    console.log("--newCwd: ", newCwd);
    console.log("--config: ", config);
    console.log("--configPath: ", configPath);
    console.log("--saveLast: ", saveLast);
    console.log("--saveNumber: ", saveNumber);
    console.log("--pathName: ", namePath);
    console.log("");
    console.log("lastTestFilePath: ", lastTestFilePath);
    console.log("lastTestNames: ", lastTestNames.join(", "));
    console.log("postfixRegex: ", postfixRegex);
    console.log("");
    console.log("-------------------------------------------");
    console.log("");
}
// async run function
export async function runTest() {
    // clear terminal+history
    if (!noClear) {
        console.log("\x1Bc");
    }
    if (help) {
        printHelp();
        return;
    }
    // folder/file walk function
    function walk(dir, filelist = [], max = depth) {
        if (max-- < 0) {
            console.log("max reached at" + dir);
            throw new Error("max reached");
        }
        const items = fs.readdirSync(dir, { withFileTypes: true });
        if (debug) {
            console.log("walk: ", items);
        }
        const dirs = items.filter(x => x.isDirectory());
        const files = items.filter(x => x.isFile());
        for (const file of files) {
            console.log("test file: ", file.name, "with", postfixRegex);
            if (postfixRegex.test(file.name)) {
                if (debug) {
                    console.log("found test: ", file.name);
                }
                filelist.push(join(dir, file.name));
            }
        }
        for (const subDir of dirs) {
            // ignore node_modules
            if (subDir.name === "node_modules") {
                continue;
            }
            if (!includeDot && /^\./.test(subDir.name)) {
                continue;
            }
            walk(join(dir, subDir.name), filelist, max);
        }
        return filelist;
    }
    console.log("Searching for tests...");
    console.log("cwd: " + cwd);
    const filePaths = walk(cwd);
    if (!noClear) {
        console.log("\x1Bc");
    }
    // print found tests
    const tests = filePaths.map(x => {
        const split = x.split("/");
        const name = split[split.length - 1].replace(postfixRegex, "");
        let label = name;
        if (namePath) {
            // remove cwd from path
            const relPathSplit = x
                .replace(cwd, "")
                .split("/")
                .filter(x => x !== "");
            label = relPathSplit.slice(0, -1).join(" > ") + " > " + name;
        }
        return {
            fullPath: x,
            name,
            label,
        };
    });
    // sort tests
    tests.sort((a, b) => {
        return a.label.localeCompare(b.label);
    });
    // create select menu
    const exitNode = { name: "Exit", label: "Exit", fullPath: "" };
    const choices = [exitNode, new separator("─── ⇓ Select test ⇓ ───"), ...tests.map(x => x.label)];
    if (lastTestNames.length > 0) {
        // keep order:
        const lastTests = [];
        for (let lastText of lastTestNames) {
            const lastTest = tests.find(x => x.name === lastText);
            if (lastTest) {
                lastTests.push(lastTest);
            }
        }
        if (lastTests.length > 0) {
            choices.unshift(new separator("──────────────────────────"));
            if (lastTests.length > 1) {
                choices.unshift(new separator("─── ⇑ Run last test ⇑ ───"));
            }
            lastTests.reverse().forEach(x => {
                choices.unshift(x.label);
            });
            choices.unshift(new separator("─── ⇓ Run last test ⇓ ───"));
        }
    }
    // run selected test
    const selected = await inquirer.prompt([
        {
            message: "Select a test to run:",
            name: "action",
            type: "list",
            loop: false,
            choices,
        },
    ]);
    // if exit selected
    if (selected.action === exitNode.label) {
        return exitNode;
    }
    // find test from selected
    const test = tests.find(x => x.label === selected.action);
    // save last test
    if (lastTestFilePath) {
        if (!lastTestNames.includes(test.name)) {
            lastTestNames.unshift(test.name);
        }
        else {
            // move to top
            lastTestNames.splice(lastTestNames.indexOf(test.name), 1);
            lastTestNames.unshift(test.name);
        }
        while (lastTestNames.length > saveNumber) {
            // remove last
            lastTestNames.pop();
        }
        fs.writeFileSync(lastTestFilePath, lastTestNames.join("\n"), "utf8");
    }
    // run test
    if (!noClear) {
        console.log("\x1Bc");
    }
    console.log("Running test: " + test.name);
    console.log("─".repeat(test.name.length + 20));
    let filePath = test.fullPath;
    // compile ts file (if ts file and not run with bun)
    let isTsFile = /\.ts$/.test(test.fullPath);
    if (!runWithBun && isTsFile) {
        if (configPath === "") {
            console.error("tsconfig.json not found at: " + configPath);
            return;
        }
        filePath = filePath.replace(/\.ts$/, ".js"); // remove postfix
        console.log("Compiling test: " + test.name + "...");
        // console.log("To file: " + filePath)
        const cmd = `tsc '${test.fullPath}'`;
        // console.log("cmd: " + cmd)
        console.log("─".repeat(test.name.length + 20));
        execSync(cmd, { stdio: "inherit" });
    }
    // spawn process runnning the test
    await new Promise(async (resolve, reject) => {
        let testProcess = spawn(runWithBun ? "bun" : "node", [filePath], {
            stdio: "inherit",
        });
        testProcess.on("error", reject);
        testProcess.on("close", code => {
            if (code === 0) {
                resolve();
            }
            else {
                const err = new Error(`child exited with code ${code}`);
                reject(err);
            }
        });
    });
    // remove compiled js file
    if (!runWithBun && isTsFile) {
        fs.unlinkSync(filePath);
    }
    console.log(" ");
}
// utils
function collectOptions(args, keys, captureValue, defaultCaptureValue, parseNumber) {
    const lowerKeys = keys.map(x => x.toLowerCase());
    const argIndex = args.findIndex(arg => lowerKeys.includes(arg.toLowerCase()));
    if (argIndex < 0) {
        return defaultCaptureValue !== undefined ? defaultCaptureValue : false;
    }
    if (!captureValue) {
        return true;
    }
    const valueIndexExists = argIndex + 1 < args.length;
    if (!valueIndexExists) {
        return defaultCaptureValue !== undefined ? defaultCaptureValue : false;
    }
    const value = args[argIndex + 1];
    const valueIsOption = /^\-/.test(value);
    if (!valueIsOption) {
        if (parseNumber) {
            const parsed = parseInt(value);
            if (isNaN(parsed)) {
                throw new Error("Invalid option value for: " + args[argIndex] + " (Not a number)");
            }
            return parsed;
        }
        return value;
    }
    if (defaultCaptureValue !== undefined) {
        return defaultCaptureValue;
    }
    throw new Error("Invalid option value for: " + args[argIndex]);
}
function printHelp() {
    console.log(`Usage: runtf [?options]
  Options:
    --help, -h                        show this help
    --dot                             include dot files
    --bun                             run test with Bun* (instead of node)
    --postfix, -p     [postfix]       postfix to search for fx testfile.tf.ts (default tf)
    --cwd, -c         [folder path]   root folder to search from  (default: process.cwd())
    --save, -s        [?filename]     save last test to file (default: .last-tf)
    --savenumber, -sn [?number]       number of test save to save last file (default: 1)
    --depth, -d       [depth]         max depth of folder to search (default: 10 max: 50)
    --config, -c      [file path]     path to tsconfig.json (default: tsconfig.json)
    --namepath -np                    include relative path in select name (fx: dir > dir > name)

  Debug:
    --debug, -db                      print debug info (includes --noClear)
    --noClear, -nc                    don't clear terminal before test
    --noRun, -nr                      don't run test (just print debug info)
  
  *Bun:
    if this is run with bun, it will automatically run with bun (--bun)

`);
}
function processArgs() {
    const processArgs = process.argv.slice(2).join(" ");
    const regex = /"[^"]+"|'[^']+'|\S+/g;
    const args = [...(processArgs.match(regex) || [])];
    return args;
}
if (!noRun) {
    // run test (top level, run right away)
    runTest();
}
