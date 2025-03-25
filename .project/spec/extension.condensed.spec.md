## VS Code Devcontainer.json Editor Extension: Condensed Specification

### Overview
This VS Code extension adds a **sidebar panel** for editing a workspace’s `devcontainer.json`—focusing on **Docker networking** and **GPU/CUDA** support. Key features:

1. **Sidebar UI** (Webview Views API) with form elements to configure Docker network modes and GPU access.  
2. **Networking Mode Dropdown** to select `--network` (bridge/host/none/custom).  
3. **GPU Access Controls** (checkbox + sub-options) to enable GPU support (`--gpus all` or device-specific).  
4. **JSON Validation** using the official devcontainer schema.

### Sidebar Integration (Webview View)
- **Contribution in `package.json`:** A custom view is defined with an ID (`devcontainerEditor.view`), shown in the Explorer sidebar.  
- **Activation:** The extension registers a `WebviewViewProvider`, which VS Code calls to render the view. Example:
  ```ts
  // in extension.ts
  export function activate(context: vscode.ExtensionContext) {
    const provider = new DevContainerViewProvider(context.extensionUri);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(DevContainerViewProvider.viewType, provider)
    );
  }
  ```
- **Rendering the Webview:** In `resolveWebviewView`, you set `webviewView.webview.html` to your custom HTML, enable scripts, and handle messages from the form.

### Sidebar UI: Key Controls

#### 1. Networking Mode
A dropdown listing Docker `--network` modes:  
- **Default (bridge)** (remove any `--network` from `runArgs`)  
- **Host** (`--network host`)  
- **None** (`--network none`)  
- **Custom** (allow a user-specified network name)

#### 2. GPU Access
A main “Enable GPU” checkbox reveals sub-options:  
- **All GPUs:** `--gpus all`.  
- **Limit GPU count:** `--gpus 1` (or another number).  
- **Specific Devices:** `--gpus "device=0,1"`, etc.  
- **Set CUDA Env Vars:** Optionally sets `CUDA_VISIBLE_DEVICES` and `NVIDIA_VISIBLE_DEVICES`.

When GPU is enabled, you can also set `"hostRequirements": { "gpu": true }` and environment variables. Disabling GPU removes those entries.

### Implementation Details

#### Webview Content (HTML & Script)
- A form with dropdowns/checkboxes for networking and GPU.  
- JavaScript using `acquireVsCodeApi()` to send changes (e.g., on “Apply” button) to the extension’s backend.

#### Extension Backend (TypeScript)
1. **Locate `devcontainer.json`:** Typically at `.devcontainer/devcontainer.json`; fallback to workspace root.  
2. **Parse JSON (jsonc-parser)** to handle comments.  
3. **Update relevant fields:**  
   - **`runArgs`:** Insert/remove `--network` and `--gpus`.  
   - **`hostRequirements.gpu`:** Set `true` or remove if GPU disabled.  
   - **`remoteEnv` (or `containerEnv`):** Set `CUDA_VISIBLE_DEVICES` if requested.  
4. **Write changes back:** Use `WorkspaceEdit` so users can undo/redo.  
5. **Validate:** Optionally check diagnostics afterward.

#### Preserving Comments
If preserving user comments/formatting is important, use incremental edits via `jsonc-parser.modify()` rather than rewriting the entire JSON.

### Additional Considerations

- **Two-Way Sync:** Listen for file changes (`onDidChangeTextDocument`) to update the sidebar if the user edits `devcontainer.json` manually.  
- **File Creation:** If `devcontainer.json` is missing, prompt to create one.  
- **Devcontainer Schema & Validation:**  
  - Contribute a `jsonValidation` entry to associate `/devcontainer.json` with the official schema.  
  - Or insert `$schema` at the top of `devcontainer.json`.  
- **Rebuild Prompt:** After changes, prompt the user to rebuild the dev container.  
- **Theming & Accessibility:** Use VS Code theme variables and proper labeling.

### Example Snippet

```ts
// In DevContainerViewProvider.ts
public resolveWebviewView(webviewView: vscode.WebviewView) {
  webviewView.webview.options = { enableScripts: true };
  webviewView.webview.html = this.getHtml(); // returns the form+script

  webviewView.webview.onDidReceiveMessage(async (msg) => {
    if (msg.command === "applyConfig") {
      await this.updateDevcontainerConfig(msg.config);
    }
  });
}
```

```ts
// updateDevcontainerConfig (simplified)
async function updateDevcontainerConfig(config: any) {
  const docUri = await findDevcontainerUri();
  const textDoc = await vscode.workspace.openTextDocument(docUri);
  let jsonObj = jsonc.parse(textDoc.getText());

  // 1) Update network settings in `runArgs`.
  // 2) Insert/remove `--gpus` if GPU is enabled/disabled.
  // 3) Set or remove hostRequirements.gpu + remoteEnv vars.

  // Write updated JSON
  const edit = new vscode.WorkspaceEdit();
  const newText = JSON.stringify(jsonObj, null, 2);
  edit.replace(docUri, new vscode.Range(0, 0, textDoc.lineCount, 0), newText);
  await vscode.workspace.applyEdit(edit);
  await textDoc.save();
}
```

This design provides a straightforward, form-based editor for `devcontainer.json` while leveraging VS Code’s webview API, JSON validation, and standard editing workflow.