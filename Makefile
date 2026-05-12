.PHONY: build watch typecheck package install clean

build:
	node scripts/generate-icon.js
	node scripts/generate-sounds.js
	node esbuild.js

watch:
	node scripts/generate-icon.js
	node scripts/generate-sounds.js
	node esbuild.js --watch

typecheck:
	npx tsc --noEmit

package:
	node scripts/generate-icon.js
	node scripts/generate-sounds.js
	node esbuild.js --production
	npx --yes @vscode/vsce package --no-dependencies

install: package
	code --install-extension $$(ls -t *.vsix | head -1)

clean:
	rm -rf out *.vsix

.DEFAULT_GOAL := build
