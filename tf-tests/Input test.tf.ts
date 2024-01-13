import inquirer from "inquirer"
import separator from "inquirer/lib/objects/separator.js"

async function run() {
  const choices = ["Name 1", new separator("─── ⇓ Select test ⇓ ───"), "Name 2", "Name 3"]

  const selected = await inquirer.prompt<{ action: string }>([
    {
      message: "Select a test to run",
      name: "action",
      type: "list",
      loop: false,
      choices,
    },
  ])

  console.log("You selected:")
  console.log(selected)
}

run()
