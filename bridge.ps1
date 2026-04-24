$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
npx tsx "$scriptPath\src\cli\bridge.ts" $args
