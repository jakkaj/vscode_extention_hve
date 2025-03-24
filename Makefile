.PHONY: install compile package clean watch run

# Default target runs both install and compile
all: install compile

# Install dependencies
install:
	npm install

# Compile TypeScript to JavaScript
compile:
	npm run compile

# Watch for changes and recompile automatically
watch:
	npm run watch

# Package the extension as a .vsix file
package:
	npx vsce package

# Clean build files
clean:
	rm -rf out/
	rm -rf *.vsix

# Run the extension in a development host
run: compile
	code-insiders --extensionDevelopmentPath=$(PWD)

# Build and run in one command
dev: compile run

# Help output
help:
	@echo "Available commands:"
	@echo "  make          - Install dependencies and compile the extension"
	@echo "  make install  - Install dependencies"
	@echo "  make compile  - Compile TypeScript to JavaScript"
	@echo "  make watch    - Watch for changes and recompile"
	@echo "  make package  - Package the extension as a .vsix file"
	@echo "  make clean    - Remove build files"
	@echo "  make run      - Run the extension in a development host"
	@echo "  make dev      - Compile and run in one command"
	@echo "  make help     - Show this help message"