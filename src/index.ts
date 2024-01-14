#! /usr/bin/env node
import { join, resolve } from "path"
import fs from "fs"
import inquirer from "inquirer"
import separator from "inquirer/lib/objects/separator.js"
import { spawn, execSync } from "child_process"

type Test = {
  fullPath: string
  name: string
}

// capture options:
const args = processArgs()
// debug
const debug = collectOptions(args, ["--debug"])
let noRun = collectOptions(args, ["--noRun", "--nr"])
let noClear = collectOptions(args, ["--noClear", "--nc"])
// options
const help = collectOptions(args, ["--help", "-h"])
const includeDot = collectOptions(args, ["--dot"])
const runWithBun = collectOptions(args, ["--bun"])
const postfix = collectOptions(args, ["--postfix", "-p"], true, "tf")
const depthValue = collectOptions(args, ["--depth"], true, "10", true)
const config = collectOptions(args, ["--config", "-c"], true)
const saveLast = collectOptions(args, ["-save", "-s"], true, ".last-tf")
const newCwd = collectOptions(args, ["--cwd", "-c"], true)

// variables
let cwd = process.cwd()
let configPath = ""
let depth = 10

// parse options:
if (debug) {
  noClear = true
  console.log("--- DEBUG ---")
  console.log("args: ", args.join(" "))
  console.log("run from cwd: ", process.cwd())
  console.log("-------------")
}
// depth
if (typeof depthValue === "number") {
  depth = depthValue
  if (depth > 50) {
    depth = 50
  }
}
// cwd
if (typeof newCwd === "string") {
  if (!fs.existsSync(newCwd)) {
    throw new Error("cwd not found: " + newCwd)
  }
  cwd = resolve(newCwd)
  process.chdir(cwd)
  if (debug) {
    console.log("cwd changed to: ", cwd)
  }
}
// config
if (typeof config === "string") {
  if (!fs.existsSync(configPath)) {
    throw new Error("tsconfig.json not found at: " + configPath)
  }
} else {
  configPath = join(cwd, "tsconfig.json")
}
configPath = resolve(configPath)

// save last test
const lastTestFilePath = typeof saveLast === "string" ? join(cwd, saveLast) : ""

const lastTestName =
  lastTestFilePath && fs.existsSync(lastTestFilePath) ? fs.readFileSync(lastTestFilePath, "utf8") : ""
// postfix
const postfixRegex = new RegExp(`\\.${postfix}\\.(js|ts)$`)

// debug
if (debug) {
  console.log("--- DEBUG Parsed args ---")
  console.log("args: ", args.join(" "))
  console.log("--help: ", help)
  console.log("--noRun: ", noRun)
  console.log("--debug: ", debug)
  console.log("--noClear: ", noClear)
  console.log("--includeDot: ", includeDot)
  console.log("--bun (runWithBun): ", runWithBun)
  console.log("--postfix: ", postfix)
  console.log("--depth: ", depth)
  console.log("--cwd: ", cwd)
  console.log("--newCwd: ", newCwd)
  console.log("--config: ", config)
  console.log("--configPath: ", configPath)
  console.log("--saveLast: ", saveLast)
  console.log("lastTestFilePath: ", lastTestFilePath)
  console.log("lastTestName: ", lastTestName)
  console.log("postfixRegex: ", postfixRegex)
}

// async run function
export async function runTest() {
  // clear terminal+history
  if (!noClear) {
    console.log("\x1Bc")
  }
  if (help) {
    printHelp()
    return
  }
  // folder/file walk function
  function walk(dir: string, filelist: string[] = [], max = depth) {
    if (max-- < 0) {
      console.log("max reached at" + dir)
      throw new Error("max reached")
    }
    const items = fs.readdirSync(dir, { withFileTypes: true })
    if (debug) {
      console.log("walk: ", items)
    }
    const dirs = items.filter(x => x.isDirectory())
    const files = items.filter(x => x.isFile())

    for (const file of files) {
      console.log("test file: ", file.name, "with", postfixRegex)
      if (postfixRegex.test(file.name)) {
        if (debug) {
          console.log("found test: ", file.name)
        }
        filelist.push(join(dir, file.name))
      }
    }
    for (const subDir of dirs) {
      // ignore node_modules
      if (subDir.name === "node_modules") {
        continue
      }
      if (!includeDot && /^\./.test(subDir.name)) {
        continue
      }
      walk(join(dir, subDir.name), filelist, max)
    }

    return filelist
  }
  console.log("Searching for tests...")
  console.log("cwd: " + cwd)
  const filePaths = walk(cwd)
  if (!noClear) {
    console.log("\x1Bc")
  }
  // print found tests
  const tests = filePaths.map(x => {
    const split = x.split("/")
    const name = split[split.length - 1].replace(postfixRegex, "")
    return {
      fullPath: x,
      name,
    } as Test
  })
  // sort tests
  tests.sort((a, b) => {
    return a.name.localeCompare(b.name)
  })

  // create select menu
  const exitNode = { name: "Exit", fullPath: "" } as Test
  const choices = [exitNode, new separator("─── ⇓ Select test ⇓ ───"), ...tests.map(x => x.name)]

  if (lastTestName) {
    const lastTest = tests.find(x => x.name === lastTestName)
    if (lastTest) {
      choices.unshift(new separator("──────────────────────────"))
      choices.unshift(lastTest.name)
      choices.unshift(new separator("─── ⇓ Run last test ⇓ ───"))
    }
  }

  // run selected test
  const selected = await inquirer.prompt<{ action: string }>([
    {
      message: "Select a test to run:",
      name: "action",
      type: "list",
      loop: false,
      choices,
    },
  ])
  // if exit selected
  if (selected.action === exitNode.name) {
    return exitNode
  }
  // find test from selected
  const test = tests.find(x => x.name === selected.action)!
  // save last test
  if (lastTestFilePath) {
    fs.writeFileSync(lastTestFilePath, test.name, "utf8")
  }
  // run test
  if (!noClear) {
    console.log("\x1Bc")
  }

  console.log("Running test: " + test.name)
  console.log("─".repeat(test.name.length + 20))

  let filePath = test.fullPath
  // compile ts file (if ts file and not run with bun)
  let isTsFile = /\.ts$/.test(test.fullPath)
  if (!runWithBun && isTsFile) {
    if (configPath === "") {
      console.error("tsconfig.json not found at: " + configPath)
      return
    }
    filePath = filePath.replace(/\.ts$/, ".js") // remove postfix
    console.log("Compiling test: " + test.name + "...")
    // console.log("To file: " + filePath)
    const cmd = `tsc '${test.fullPath}'`
    // console.log("cmd: " + cmd)
    console.log("─".repeat(test.name.length + 20))
    execSync(cmd, { stdio: "inherit" })
  }
  // spawn process runnning the test
  await new Promise<void>(async (resolve, reject) => {
    let testProcess = spawn(runWithBun ? "bun" : "node", [filePath], {
      stdio: "inherit",
    })
    testProcess.on("error", reject)
    testProcess.on("close", code => {
      if (code === 0) {
        resolve()
      } else {
        const err = new Error(`child exited with code ${code}`)
        reject(err)
      }
    })
  })
  // remove compiled js file
  if (!runWithBun && isTsFile) {
    fs.unlinkSync(filePath)
  }
  console.log(" ")
}

// utils
function collectOptions(
  args: string[],
  keys: string[],
  captureValue?: true,
  defaultCaptureValue?: string | number,
  parseNumber?: true
) {
  const lowerKeys = keys.map(x => x.toLowerCase())
  const argIndex = args.findIndex(arg => lowerKeys.includes(arg.toLowerCase()))
  if (argIndex < 0) {
    return defaultCaptureValue !== undefined ? defaultCaptureValue : false
  }
  if (!captureValue) {
    return true
  }
  const valueIndexExists = argIndex + 1 < args.length
  if (!valueIndexExists) {
    return defaultCaptureValue !== undefined ? defaultCaptureValue : false
  }
  const value = args[argIndex + 1]
  const valueIsOption = /^\-/.test(value)
  if (!valueIsOption) {
    if (parseNumber) {
      const parsed = parseInt(value)
      if (isNaN(parsed)) {
        throw new Error("Invalid option value for: " + args[argIndex] + " (Not a number)")
      }
      return parsed
    }
    return value
  }
  if (defaultCaptureValue !== undefined) {
    return defaultCaptureValue
  }
  throw new Error("Invalid option value for: " + args[argIndex])
}

function printHelp() {
  console.log(`Usage: runtf [?options]
  Options:
    --help, -h                  show this help
    --dot                       include dot files
    --bun                       run test with Bun (instead of node)
    --postfix, -p [postfix]     postfix to search for fx testfile.tf.ts (default tf)
    --cwd, -c [folder path]     root folder to search from  (default: process.cwd())
    --save, -s  [?filename]     save last test to file (default: .last-tf)
    --depth, -d [depth]         max depth of folder to search (default: 10 max: 50)
    --config, -c [file path]    path to tsconfig.json (default: tsconfig.json)
    
  Debug:
    --debug                     print debug info (includes --noClear)
    --noClear, --nc             don't clear terminal before test
    --noRun, --nr               don't run test (just print debug info)
`)
}

function processArgs() {
  const processArgs = process.argv.slice(2).join(" ")
  const regex = /"[^"]+"|'[^']+'|\S+/g
  const args = [...(processArgs.match(regex) || [])]
  return args
}

if (!noRun) {
  // run test (top level, run right away)
  runTest()
}
