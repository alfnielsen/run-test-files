# Run-test-files

This is a `cli` tool: `runtf`

It scan for files with a postfix, \
then list them in a select menu, \
and run the selected file.

It can run `typescript` files\*

## Install

> npm install -g run-test-files

## Usage

> runtf

## Select Menu Example

First run

> runtf

This will scan for files with the postfix `.tf.ts` and list them in a select menu:

**Files:**

```
📁 Some project root
┗ 📁 tf-tests
  ┗┳ Hello World (ts).tf.ts
   ┣ Hello World.tf.js
   ┗ Input test.tf.ts

```

**Select menu:**

```
? Select a test to run: (Use arrow keys)
❯ Exit
  ─── ⇓ Select test ⇓ ───
  Hello World
  Hello World (ts)
  Input test
```

## Options

```
Usage: runtf [?options]
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
    --namepath -n                     include relative path in select name (fx: dir > dir > name)

  Debug:
    --debug                           print debug info (includes --noClear)
    --noClear, --nc                   don't clear terminal before test
    --noRun, --nr                     don't run test (just print debug info)

  *Bun:
    if this is run with bun, it will automatically run with bun (--bun)
```

## Postfix

You can change the postfix to search for, \
with the `--postfix` option

> runtf --postfix mytest

This will search for files with the postfix `.mytest.ts` instead of `.tf.ts`

## Save last test

You can save the last test to a file, \
and run it again later with the `--save` option
It will apper as the first option in the select menu.

You can specify a filename, \
or use the default `.last-tf`

> runtf --save mylasttest.txt

## Run with Bun

You can run the test with [Bun](https://bun.sh/)

Which have native support for typescript. \
_(No need to compile to javascript first)_

You must have `bun` must be installed globally.

If you run the cli with `bun` it will automatically run with bun.

If you run it with `node` it run child process with bun by using `--bun` option

> runtf --bun

## TypeScript

`runtf` can run `typescript files`, \
if typescript is installed and a root tsconfig.json file exist.

Use the `--config` option to specify another tsconfig.json file

> runtf --config ./tsconfig.test.json

or

> runtf --config ../

`runtf` will compile the typescript files to javascript before running it.

The js file name will have the same name, with ts replaced with js \
and will be delete after running it.
