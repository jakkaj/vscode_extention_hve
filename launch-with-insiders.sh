#!/bin/bash

# Compile the extension first
npm run compile

# Create a temporary workspace if not running in one
TEMP_WS_DIR="/tmp/vscode-extension-test-workspace"
mkdir -p "$TEMP_WS_DIR"

# Instead of packaging, launch VS Code Insiders with the extension development path
echo "Launching VS Code Insiders with the extension in development mode..."
code-insiders --disable-extensions --new-window --extensionDevelopmentPath="$(pwd)" "$TEMP_WS_DIR"

# If the above doesn't work, try this alternate approach for WSL
if [ $? -ne 0 ]; then
  echo "Trying alternate launch method for WSL..."
  code-insiders --disable-extensions --new-window --extensionDevelopmentPath="$(pwd)" "$TEMP_WS_DIR" &
fi