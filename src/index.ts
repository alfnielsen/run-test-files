#! /usr/bin/env node
import { join } from "path"
import fs from "fs"
import inquirer from "inquirer"
import separator from "inquirer/lib/objects/separator.js"
import { spawn, execSync } from "child_process"

type Test = {
  fullPath: string
  name: string
}

export async function runTest() {
  // clear terminal+history
  console.log("\x1Bc")
  const args = process.argv.slice(2)
  const help = args.findIndex(x => x === "--help" || x === "-h")
  if (help >= 0) {
    console.log(`Usage: tf [options]
  Options:
    --help, -h                show this help
    --dot                     include dot files

  Options with values: --[option] value
    --postfix, -p             postfix to search for fx testfile.tf.ts (default tf)
    --cwd, -c                 root folder to search from  (default: process.cwd())
    --last, -l, -save, -s     save last test to file (default: .last-tf)
    --depth, -d               max depth of folder to search (default: 10 max: 30)
`)
    return
  }
  const includeDot = args.includes("--dot")
  const postFixIndex = args.findIndex(x => x === "--postfix" || x === "-p")
  const depthIndex = args.findIndex(x => x === "--depth" || x === "-d")
  let depth = 10
  if (depthIndex >= 0 && depthIndex + 1 < args.length) {
    const depthValue = parseInt(args[depthIndex + 1])
    if (!isNaN(depthValue)) {
      depth = depthValue
      if (depth > 30) {
        depth = 30
      }
    }
  }
  const rootIndex = args.findIndex(x => x === "--root" || x === "-r" || x === "--cwd" || x === "-c")
  if (rootIndex >= 0 && rootIndex + 1 < args.length) {
    process.chdir(args[rootIndex + 1])
  }
  const cwd = process.cwd()
  let postfix = "tf"
  if (postFixIndex >= 0 && postFixIndex + 1 < args.length) {
    postfix = args[postFixIndex + 1]
  }
  const saveLastIndex = args.findIndex(
    x => x === "--last" || x === "-l" || x === "--last-test" || x === "-lt" || x === "-save" || x === "-s"
  )
  let lastTestFilePath = ""
  let lastTestName = ""
  if (saveLastIndex >= 0) {
    lastTestFilePath = join(cwd, ".last-tf")
    if (saveLastIndex + 1 < args.length) {
      const lastVTest = args[saveLastIndex + 1]
      if (!/^\-/.test(lastVTest)) {
        lastTestFilePath = join(cwd, lastVTest)
      }
    }
  }
  if (lastTestFilePath && fs.existsSync(lastTestFilePath)) {
    lastTestName = fs.readFileSync(lastTestFilePath, "utf8")
  }

  let max = depth
  const postfixRegex = new RegExp(`\\.${postfix}\\.(js|ts)$`)
  function walk(dir: string, filelist: string[] = []) {
    if (max-- < 0) {
      throw new Error("max reached")
    }
    const items = fs.readdirSync(dir, { withFileTypes: true })
    const dirs = items.filter(x => x.isDirectory())
    const files = items.filter(x => x.isFile())

    for (const file of files) {
      if (postfixRegex.test(file.name)) {
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
      walk(join(dir, subDir.name), filelist)
    }

    return filelist
  }
  const filePaths = walk(cwd)

  const tests = filePaths.map(x => {
    const split = x.split("/")
    const name = split[split.length - 1].replace(postfixRegex, "")
    return {
      fullPath: x,
      name,
    } as Test
  })
  // sort
  tests.sort((a, b) => {
    return a.name.localeCompare(b.name)
  })
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

  const selected = await inquirer.prompt<{ action: string }>([
    {
      message: "Select a test to run",
      name: "action",
      type: "list",
      loop: false,
      choices,
    },
  ])
  if (selected.action === exitNode.name) {
    return exitNode
  }
  const test = tests.find(x => x.name === selected.action)!
  // save last test
  if (lastTestFilePath) {
    fs.writeFileSync(lastTestFilePath, test.name, "utf8")
  }
  // run test

  // if (testProcess.stdout) {
  //   testProcess.stdout.on('data', data => {
  //     stdout.append(data)
  //   })
  // }

  // if (child.stderr) {
  //   child.stderr.on('data', data => {
  //     stderr.append(data)
  //   })
  // }
  // clear terminal+history
  console.log("\x1Bc")

  console.log("Running test: " + test.name)
  console.log("─".repeat(test.name.length + 20))

  let isTsFile = /\.ts$/.test(test.fullPath)
  let filePath = test.fullPath
  if (isTsFile) {
    filePath = filePath.replace(/\.ts$/, ".js") // remove postfix
    console.log("Compiling test: " + test.name + "...")
    // console.log("To file: " + filePath)
    const cmd = `npx tsc '${test.fullPath}' --target esnext --module nodenext --noEmitOnError --skipLibCheck`
    // console.log("cmd: " + cmd)
    console.log("─".repeat(test.name.length + 20))
    execSync(cmd, { stdio: "inherit" })
  }
  await new Promise<void>((resolve, reject) => {
    let testProcess = spawn("node", [filePath], {
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
  if (isTsFile) {
    fs.unlinkSync(filePath)
  }
  console.log(" ")
}

runTest()
