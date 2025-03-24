
# VS Code Devcontainer.json Editor Extension Specification

## Overview  
This Visual Studio Code extension (TypeScript) provides a sidebar UI to easily edit a workspace’s **`devcontainer.json`**. It focuses on two main configuration areas: Docker networking mode and GPU/CUDA access. Key features include: 

- **Sidebar UI Integration:** A custom sidebar view (using VS Code’s Webview API) for editing `devcontainer.json` via form controls (dropdowns, checkboxes, etc.) ([Webview API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/webview#:~:text=The%20webview%20API%20allows%20extensions,VS%20Code%27s%20native%20APIs%20support)) ([Webview API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/webview#:~:text=,sample%20extension%20for%20more%20details)).  
- **Networking Mode Dropdown:** A dropdown menu listing all Docker-supported network modes (e.g. Bridge (default), Host, None, or a custom network) ([Docker Cheat Sheet - Docker Networks - DEV Community](https://dev.to/manojpatra1991/docker-cheat-sheet-docker-networks-49k4#:~:text=Default%20network%20types)), allowing the user to set the container’s networking mode.  
- **GPU Access Controls:** A dedicated section to enable NVIDIA GPU support for CUDA and `nvidia-smi`. This includes a primary **“Enable GPU”** checkbox and conditional sub-settings (e.g. using all GPUs or specifying particular GPUs) that appear when GPU support is enabled. Toggling these updates the devcontainer config (adding Docker `--gpus` options and related settings).  
- **VS Code Native UI APIs:** Uses VS Code’s well-supported Webview Views API for the UI, ensuring compatibility and a native look-and-feel (as opposed to external windows) ([view - VS Code Extension - How to add a WebviewPanel to the sidebar? - Stack Overflow](https://stackoverflow.com/questions/67150547/vs-code-extension-how-to-add-a-webviewpanel-to-the-sidebar#:~:text=registerWebviewViewProvider,sample%20linked%20on%20that%20page)) ([view - VS Code Extension - How to add a WebviewPanel to the sidebar? - Stack Overflow](https://stackoverflow.com/questions/67150547/vs-code-extension-how-to-add-a-webviewpanel-to-the-sidebar#:~:text=%7B%20,)). The extension does not introduce new electron windows; it runs inside VS Code’s sidebar for a seamless user experience.  
- **JSON Validation:** After any modifications, the extension validates the `devcontainer.json`. It leverages VS Code’s JSON language support (and the official devcontainer schema) so that errors or schema deviations are caught and highlighted. The extension ensures that changes result in well-formed JSON (and warns the user of issues).  

## UI Integration in the VS Code Sidebar  
**Using Webview Views:** The extension integrates its UI as a **Webview View** in VS Code’s sidebar (activity bar). VS Code’s Webview API is the standard approach to implement custom UI in extensions ([Webview API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/webview#:~:text=The%20webview%20API%20allows%20extensions,VS%20Code%27s%20native%20APIs%20support)). In particular, “webview views” allow an extension to embed an HTML/JS based interface into the sidebar or panel ([Webview API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/webview#:~:text=,sample%20extension%20for%20more%20details)). This is preferable to trying to misuse editor panels for UI. We use `vscode.window.registerWebviewViewProvider` to register our sidebar panel. A snippet of the extension’s activation in `extension.ts` is as follows:

```ts
// extension.ts (activate function)
export function activate(context: vscode.ExtensionContext) {
  const provider = new DevContainerViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DevContainerViewProvider.viewType, provider)
  );
}
```  

In the extension’s `package.json`, we contribute a custom view so VS Code knows to show it in the sidebar. For example: 

```json
"contributes": {
  "views": {
    "explorer": [
      {
        "id": "devcontainerEditor.view",  
        "name": "Devcontainer Editor",  
        "type": "webview"  
      }
    ]
  }
},
"activationEvents": [
  "onView:devcontainerEditor.view"
]
```  

This declares a view with an ID our extension uses, placed in the Explorer sidebar (it could also be a dedicated view container with its own icon). According to VS Code’s docs, using `registerWebviewViewProvider` in code and declaring the view in `package.json` is the correct way to add a webview to the sidebar ([view - VS Code Extension - How to add a WebviewPanel to the sidebar? - Stack Overflow](https://stackoverflow.com/questions/67150547/vs-code-extension-how-to-add-a-webviewpanel-to-the-sidebar#:~:text=registerWebviewViewProvider,sample%20linked%20on%20that%20page)) ([view - VS Code Extension - How to add a WebviewPanel to the sidebar? - Stack Overflow](https://stackoverflow.com/questions/67150547/vs-code-extension-how-to-add-a-webviewpanel-to-the-sidebar#:~:text=%7B%20,)). 

**Webview Setup:** Our `DevContainerViewProvider` class implements `vscode.WebviewViewProvider`. In its `resolveWebviewView(...)` method, we configure and populate the webview: 

- **Enable Scripts:** Allow the webview to run scripts so our UI is interactive. This is done via `webviewView.webview.options = { enableScripts: true, ... }` ([vscode-extension-samples/webview-view-sample/src/extension.ts at main · microsoft/vscode-extension-samples · GitHub](https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample/src/extension.ts#:~:text=webviewView.webview.options%20%3D%20)). We can also set `localResourceRoots` if loading local scripts or images.  
- **HTML Content:** Set the `webview.html` to our extension’s UI HTML. This HTML will contain the form controls (dropdown, checkboxes, etc.) and a script to handle user input events ([vscode-extension-samples/webview-view-sample/src/extension.ts at main · microsoft/vscode-extension-samples · GitHub](https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample/src/extension.ts#:~:text=webviewView)). We generate or load this HTML in code (it can be defined as a template string or read from a bundled HTML file). We use a content security policy and a nonce for scripts, per VS Code’s webview security best practices ([vscode-extension-samples/webview-view-sample/src/extension.ts at main · microsoft/vscode-extension-samples · GitHub](https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample/src/extension.ts#:~:text=examples)) ([vscode-extension-samples/webview-view-sample/src/extension.ts at main · microsoft/vscode-extension-samples · GitHub](https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample/src/extension.ts#:~:text=%3Cmeta%20http,nonce)).  

For example, a simplified `resolveWebviewView` might look like: 

```ts
class DevContainerViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "devcontainerEditor.view";
  constructor(private readonly _extUri: vscode.Uri) {}
  resolveWebviewView(webviewView: vscode.WebviewView) {
    // Configure webview
    webviewView.webview.options = { enableScripts: true };
    // Set HTML content
    webviewView.webview.html = this.getHtmlContent(webviewView.webview);
    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
  }
  // ... getHtmlContent() and handleMessage() defined below ...
}
```  

## Sidebar UI Components and Behavior  

**1. Networking Mode Dropdown:** The UI provides a dropdown (`<select>`) listing Docker network modes. The common options are: **Bridge (default)**, **Host**, **None**, and potentially **Custom network**. These correspond to Docker’s `--network` modes (Bridge is default, Host shares the host network, None disables networking) ([Docker Cheat Sheet - Docker Networks - DEV Community](https://dev.to/manojpatra1991/docker-cheat-sheet-docker-networks-49k4#:~:text=Default%20network%20types)). For example: 

```html
<label>Network Mode: 
  <select id="networkMode">
    <option value="">Default (Bridge)</option>
    <option value="host">Host</option>
    <option value="none">None</option>
    <option value="custom">Other (specify)</option>
  </select>
</label>
<div id="customNetworkField" style="display:none; margin-top: 4px;">
  <input type="text" id="customNetworkName" placeholder="Network name or ID">
</div>
```  

If “Other (specify)” is chosen, a text field is revealed to input a custom network name (allowing user-defined Docker networks or special modes like `container:<id>`). Selecting an option will send a message to the extension (or we can wait for an explicit “Apply” click) to update the `devcontainer.json`. The extension will map this selection to the JSON: 

- **Bridge (Default):** No explicit entry or ensure any existing network override is removed (since Docker’s default is bridge).  
- **Host/None:** Add or update the Docker run argument for network, e.g. ensure `runArgs` contains `["--network", "host"]` or `"none"`.  
- **Custom:** Add `["--network", "<customName>"]` to `runArgs`.  

Under the hood, `devcontainer.json` has no direct “network” property; we use the `runArgs` array to pass Docker flags ([devcontainer.json schema](https://containers.dev/implementors/json_schema/#:~:text=,%7D)). The extension will handle inserting or replacing the `--network` flag in `runArgs`. (If `runArgs` doesn’t exist, it will be created as needed.) 

**2. GPU Access Section:** This section is visually grouped (and perhaps collapsible) with a primary **“Enable GPU”** checkbox. When unchecked (off), no GPU support is configured (the devcontainer will run without GPU access). When checked, additional sub-options appear to fine-tune GPU usage. For example: 

```html
<label>
  <input type="checkbox" id="enableGpu"> Enable NVIDIA GPU support
</label>
<div id="gpuOptions" style="margin: 0 0 0 1em; display:none;">
  <!-- Sub-options shown only if enableGpu is checked -->
  <p style="margin:4px 0;"><strong>GPU Access:</strong></p>
  <label>
    <input type="radio" name="gpuMode" value="all" checked> Use all GPUs (full access)
  </label><br/>
  <label>
    <input type="radio" name="gpuMode" value="count"> Limit GPU count:
    <input type="number" id="gpuCount" value="1" min="1" style="width:50px;" disabled>
  </label><br/>
  <label>
    <input type="radio" name="gpuMode" value="devices"> Specify GPU devices:
    <input type="text" id="gpuDevices" placeholder="e.g. 0,1" disabled>
  </label><br/>
  <label>
    <input type="checkbox" id="setCudaEnv" checked> Set CUDA environment variables
  </label>
</div>
```  

In this UI:  
- Checking “Enable NVIDIA GPU support” immediately enables Docker GPU access. By default, we assume “Use all GPUs” (which will correspond to Docker’s `--gpus all`). Other radio options allow advanced control:
  - **All GPUs:** Equivalent to `--gpus all` (the container can use all host GPUs). This is the simplest way to allow CUDA and makes `nvidia-smi` available ([python - Using GPU in VS code container - Stack Overflow](https://stackoverflow.com/questions/72129213/using-gpu-in-vs-code-container#:~:text=%22features%22%3A%20%7B%20%22ghcr.io%2Fdevcontainers%2Ffeatures%2Fnvidia,)).  
  - **Limit GPU count:** Allows the user to specify a number of GPUs. For example, if set to 1, we would add `--gpus 1` (Docker interprets this as limit to 1 GPU). The numeric input is enabled only when this radio is selected.  
  - **Specific GPU devices:** Allows specifying particular GPU indices or UUIDs. E.g., entering “0,1” would result in `--gpus "device=0,1"`. This radio enables the text field for manual entry.  
- “Set CUDA environment variables”: When checked, the extension will add environment variables like `CUDA_VISIBLE_DEVICES` and `NVIDIA_VISIBLE_DEVICES` inside the devcontainer to match the selection. (By default, `--gpus all` already makes all GPUs accessible, but setting these can explicitly communicate device visibility). If using “Limit GPU count” or specific devices, these env vars can be set accordingly (e.g., `CUDA_VISIBLE_DEVICES="0,1"`). This option ensures tools inside the container detect the intended GPUs.  

**Mapping to devcontainer.json:** When GPU support is enabled, the extension updates multiple fields in `devcontainer.json`: 

- **Docker Run Args:** We ensure the Docker command includes the appropriate `--gpus` flag. For “all GPUs”, we add `--gpus all` (as shown in many examples ([python - Using GPU in VS code container - Stack Overflow](https://stackoverflow.com/questions/72129213/using-gpu-in-vs-code-container#:~:text=%22features%22%3A%20%7B%20%22ghcr.io%2Fdevcontainers%2Ffeatures%2Fnvidia,))). For a count or specific devices, we construct the `--gpus` argument (e.g., `--gpus 2` or `--gpus "device=0,1"`). This will be added to the `runArgs` array.  
- **Host Requirements:** Optionally, set `"hostRequirements": { "gpu": true }` in the devcontainer config to indicate a GPU is required on the host. The devcontainer spec allows `gpu` to be `true`, `false`, or `"optional"` ([devcontainer.json schema](https://containers.dev/implementors/json_schema/#:~:text=)). Setting this helps VS Code or other tools understand the container needs GPU capability (and can warn if none available). Our extension will set `gpu: true` when GPU support is enabled (and remove or set `false` when disabled).  
- **Environment Variables:** If the user opted to set CUDA environment variables, we add entries under `devcontainer.json`’s `"remoteEnv"` or `"containerEnv"` as appropriate. For example, `CUDA_VISIBLE_DEVICES="0,1"` and `NVIDIA_VISIBLE_DEVICES="0,1"` if specific devices were selected. For “all GPUs”, we might set them to `"all"` (the stack overflow example shows this in `remoteEnv` ([python - Using GPU in VS code container - Stack Overflow](https://stackoverflow.com/questions/72129213/using-gpu-in-vs-code-container#:~:text=%7D%2C%20,%7D))). These ensure tools like CUDA or `nvidia-smi` behave as expected inside the container.  
- **Devcontainer Features (Optional):** The extension might recommend using the official NVIDIA CUDA devcontainer Feature to install CUDA drivers inside the container. For instance, adding the feature `ghcr.io/devcontainers/features/nvidia-cuda` with a chosen CUDA version ([python - Using GPU in VS code container - Stack Overflow](https://stackoverflow.com/questions/72129213/using-gpu-in-vs-code-container#:~:text=%7B%20,gpus%22%2C%20%22all)). However, modifying `"features"` might be beyond the scope of simple config editing. We note this as a suggestion in documentation, but the primary focus is enabling Docker GPU access.  

All sub-options are only enabled (interactable) when the main “Enable GPU” is checked. The UI logic (written in the webview script) will disable/enable fields accordingly (e.g., toggling the `disabled` attribute on the GPU count and devices fields based on which radio is selected).

## Implementation Details  

### Building the Webview UI (HTML/Script)  
We use an HTML page (string) for the webview’s content. This page includes form controls described above and a script to handle user interactions. Key points for the webview script: 

- It calls `acquireVsCodeApi()` to get a VS Code API handle for message passing. For example:  
  ```js
  const vscode = acquireVsCodeApi();
  document.getElementById('networkMode').addEventListener('change', () => {
    const modeSelect = document.getElementById('networkMode');
    const value = modeSelect.value;
    vscode.postMessage({ command: 'networkChanged', value: value });
  });
  ```  
  Similar listeners are attached for the GPU checkbox and related inputs. We might bundle the entire form state and send on a “Save” action, or send incremental updates as above. For simplicity, implementing an **“Apply”** button that sends all current form values in one message (e.g., `{ command: 'applyConfig', config: {...} }`) is a good approach. This reduces frequency of disk writes.  
- The script also handles enabling/disabling the GPU sub-option fields. For example, if “specific devices” radio is selected, it enables the text field for device IDs and disables the count field. If “Enable GPU” is unchecked, it may grey out or hide all sub-options. These are pure frontend behaviors for a better UX.  

The HTML can use basic styling (inline CSS or a VS Code theme-aware stylesheet) and should follow VS Code’s theming (e.g., use `--vscode-foreground` CSS variables, etc., if needed). We keep the design simple (labels, checkboxes, etc. similar to VS Code’s native settings UI for consistency).

### Extension Backend Logic (TypeScript)  

**Activation & Message Handling:** In `DevContainerViewProvider.resolveWebviewView`, after setting the HTML, we register an event handler to receive messages from the webview: 

```ts
webviewView.webview.onDidReceiveMessage(message => {
  switch (message.command) {
    case 'applyConfig':
      this.updateDevcontainerConfig(message.config);
      break;
    // ... handle other message types if using incremental updates
  }
});
```  

This uses VS Code’s message-passing mechanism. The webview posts messages which the extension can receive ([vscode-extension-samples/webview-view-sample/src/extension.ts at main · microsoft/vscode-extension-samples · GitHub](https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample/src/extension.ts#:~:text=webviewView)). In this case, we expect a command `applyConfig` carrying the new configuration values (like selected network mode, GPU enabled flag, etc.). We then call `updateDevcontainerConfig` with that data.

**Reading & Writing `devcontainer.json`:** The `updateDevcontainerConfig` function will perform the following steps: 

1. **Locate the devcontainer file:** Typically, `devcontainer.json` resides in the workspace in a folder named `.devcontainer/` (common path is `.devcontainer/devcontainer.json`). In some setups, it could be at the workspace root. The extension should search for the file. This can be done by:  
   ```ts
   const wsFolders = vscode.workspace.workspaceFolders;
   if (!wsFolders) return; // no folder open
   // Check .devcontainer/devcontainer.json
   let devcontainerUri = vscode.Uri.joinPath(wsFolders[0].uri, '.devcontainer/devcontainer.json');
   try {
     await vscode.workspace.fs.stat(devcontainerUri);
   } catch {
     // Fallback: workspace root devcontainer.json
     devcontainerUri = vscode.Uri.joinPath(wsFolders[0].uri, 'devcontainer.json');
   }
   ```  
   If the file doesn’t exist, we could prompt the user to create one with a default template.

2. **Load and parse JSON:** Read the file content via the VS Code file system API:  
   ```ts
   const fileData = await vscode.workspace.fs.readFile(devcontainerUri);
   const content = fileData.toString('utf8');
   // Parse JSON (support comments):
   const json = JSON.parse(stripJsonComments(content));
   ```  
   Here we ensure to handle JSON with comments. VS Code treats `devcontainer.json` as JSONC (JSON with comments) ([Editing JSON with Visual Studio Code](https://code.visualstudio.com/Docs/languages/json#:~:text=In%20addition%20to%20the%20default,editor%20will%20display%20a%20warning)), so using a utility to strip comments (or a JSONC parser library) is important. We could use the `jsonc-parser` package (which VS Code uses internally for settings) to parse without losing data. For example:  
   ```ts
   import * as jsonc from 'jsonc-parser';
   const jsonObj = jsonc.parse(content);
   ```  

3. **Modify the JSON object:** Based on `message.config`, update relevant properties in the parsed object:
   - For network: adjust `json.runArgs`. For example, remove any existing `--network` entry, then if a new mode is specified (host/none/custom) and not default, push `"--network", "<mode>"` into `runArgs`.  
   - For GPU: if GPU enabled:
     - Ensure `json.runArgs` contains `"--gpus", "<value>"` (where `<value>` is `all`, a number, or `"device=X"` string as determined by the sub-option). Remove any previous `--gpus` if present to avoid duplicates.
     - Set `json.hostRequirements.gpu = true` (if not already). If the user chose “optional” somehow, we could set `"optional"`, but our UI doesn’t expose that – we use boolean true/false.
     - If “set CUDA env” is true, set `json.remoteEnv["CUDA_VISIBLE_DEVICES"]` and `json.remoteEnv["NVIDIA_VISIBLE_DEVICES"]` to the appropriate device list (or `"all"`). If `remoteEnv` (or `containerEnv`) object doesn’t exist, create it.
   - If GPU disabled: remove or undo all above (remove `--gpus` from runArgs, set `hostRequirements.gpu` to false or remove it, remove any CUDA env vars that our extension manages).
   - We take care not to disturb unrelated fields in `devcontainer.json`. 

4. **Write changes back to file:** We convert the JSON object to a string and save it. To integrate well with VS Code, we use a Workspace Edit so that changes can be undone by the user if needed. For example:  
   ```ts
   const edit = new vscode.WorkspaceEdit();
   const newContent = JSON.stringify(jsonObj, null, 4);  // pretty-print with 4 spaces
   const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
   edit.replace(devcontainerUri, fullRange, newContent);
   await vscode.workspace.applyEdit(edit);
   ```  
   Using `workspace.applyEdit` will update the file in the editor and preserve the undo/redo stack ([Custom Editor API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/custom-editors#:~:text=entry%20to%20the%20JSON%29)). We then optionally call `doc.save()` if we want to save immediately (or we rely on VS Code’s normal file save, but since this is a config change, saving immediately might be user-friendly). We ensure the edit is minimal – ideally, we would only change the portions of text that were modified (to preserve comments/formatting). VS Code’s documentation encourages keeping JSON edits minimal and respecting existing formatting ([Custom Editor API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/custom-editors#:~:text=3,vscode.workspace.applyEdit)). For a simpler implementation, we might rewrite the whole file (which will remove comments). A more advanced implementation could use `jsonc-parser.modify()` to generate edits that inject or change specific JSON keys without clobbering comments. This is an **important consideration**: preserve user comments or formatting where possible.  

5. **Validation and Error Handling:** After writing, the extension should validate that the resulting JSON is parseable and conforms to the devcontainer schema. If the JSON stringification succeeded, it’s syntactically valid JSON. However, there could be schema issues (like a wrong type). We leverage VS Code’s JSON language service to catch those. The extension can programmatically retrieve JSON diagnostics or rely on VS Code to highlight errors if the file is open. For example:  
   ```ts
   const diagnostics = vscode.languages.getDiagnostics(devcontainerUri);
   if (diagnostics.length > 0) {
       vscode.window.showWarningMessage("Devcontainer configuration updated, but has validation issues. Please check the file.");
   }
   ```  
   Additionally, if an error occurs during our update (e.g., JSON parse fails due to some unexpected content), we must handle it gracefully. The extension should not crash if the JSON is temporarily invalid ([Custom Editor API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/custom-editors#:~:text=Also%20remember%20that%20if%20you,and%20how%20to%20fix%20it)). Instead, it can show an error message to the user with context. For instance, if `JSON.parse` fails, we catch it and do `vscode.window.showErrorMessage("Failed to apply changes: devcontainer.json contains invalid JSON.")`. This aligns with best practices that an extension should inform the user about JSON errors and how to fix them ([Custom Editor API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/custom-editors#:~:text=Also%20remember%20that%20if%20you,and%20how%20to%20fix%20it)).

### JSON Schema Validation Integration  
To ensure that modifications are valid and to provide IntelliSense for `devcontainer.json`, we use the devcontainer JSON schema. VS Code can automatically validate JSON against a schema when one is associated ([Editing JSON with Visual Studio Code](https://code.visualstudio.com/Docs/languages/json#:~:text=JSON%20schemas%20and%20settings)) ([Editing JSON with Visual Studio Code](https://code.visualstudio.com/Docs/languages/json#:~:text=The%20association%20of%20a%20JSON,schemas)). We take a two-fold approach: 

1. **Schema Declaration:** We add a `$schema` property to the top of the `devcontainer.json` when creating it (if not already present). The devcontainer spec has a published schema (for example, at `https://raw.githubusercontent.com/devcontainers/spec/main/schemas/devContainer.schema.json`). By adding:  
   ```json
   {
     "$schema": "https://containers.dev/implementors/json_schema/devContainerSchema.json",
     "name": "...",
     // rest of config
   }
   ```  
   at the top of the JSON, VS Code will fetch and use that schema for validation. (We need to be cautious: `$schema` is generally supported ([Editing JSON with Visual Studio Code](https://code.visualstudio.com/Docs/languages/json#:~:text=In%20the%20following%20example%2C%20the,contents%20follow%20the%20CoffeeLint%20schema)), but if the devcontainer consuming tools don’t expect a `$schema` field, we might not want to pollute the file. The spec doesn’t forbid extra fields, but it’s something to consider. Alternatively, we rely on method #2 below.)

2. **Contributing Schema via Extension:** The extension can contribute a schema mapping so that any `devcontainer.json` (by name) uses the schema, without needing the `$schema` field. In `package.json` we can include:  
   ```json
   "contributes": {
     "jsonValidation": [
       {
         "fileMatch": [
           "/devcontainer.json",
           "/.devcontainer/devcontainer.json"
         ],
         "url": "https://containers.dev/implementors/json_schema/devContainerSchema.json"
       }
     ]
   }
   ```  
   This registers with VS Code’s JSON language service that files named `devcontainer.json` (or in `.devcontainer` folder) should be validated against the given schema URL. VS Code allows extensions to provide such schema associations ([JSON Schema - Resources, Notes, and VSCode Tips | Joshua's Docs](https://docs.joshuatz.com/cheatsheets/js/json-schema/#:~:text=,example)). This is exactly how built-in extensions provide IntelliSense for files like `package.json` ([JSON Schema - Resources, Notes, and VSCode Tips | Joshua's Docs](https://docs.joshuatz.com/cheatsheets/js/json-schema/#:~:text=,example)). By using the official devcontainer schema, the user gets live validation and completions for all fields (including the ones our UI touches, like `runArgs`, `hostRequirements`, etc.).  

Using the schema means that after our extension writes changes, if something is off (say we put a string where an array is expected), the JSON editor will show a red squiggly line. Our extension’s responsibility is mainly to produce correct config, but this acts as a safety net and helpful guide for users. We will include documentation links in our extension README for the devcontainer.json reference so advanced users can understand all available options (e.g., linking to the official devcontainer reference on containers.dev).

## Example Code Snippets  

Below are simplified code snippets illustrating major components of the extension:

- **Activation and View Registration (extension.ts):** Registers the webview provider for the sidebar.  
  ```ts
  export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        DevContainerViewProvider.viewType,
        new DevContainerViewProvider(context.extensionUri)
      )
    );
  }
  ```  
  This uses the `registerWebviewViewProvider` API to bind our provider class to the view ID contributed in the package.json ([vscode-extension-samples/webview-view-sample/src/extension.ts at main · microsoft/vscode-extension-samples · GitHub](https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample/src/extension.ts#:~:text=const%20provider%20%3D%20new%20ColorsViewProvider%28context)). VS Code will call `resolveWebviewView` when the user opens the Explorer sidebar (or when they click our view).

- **Webview Content and Messaging (DevContainerViewProvider.ts):** Sets up the HTML UI and message listener.  
  ```ts
  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    // Allow script execution in the webview
    webviewView.webview.options = { enableScripts: true };
    // Set the HTML content (for brevity, not shown here)
    webviewView.webview.html = this.getHtml();
    // Message handler for communication from the webview
    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'applyConfig') {
        this.updateDevcontainerConfig(msg.config);
      }
    });
  }
  ```  
  This corresponds to enabling scripts and handling messages as shown in the webview sample ([vscode-extension-samples/webview-view-sample/src/extension.ts at main · microsoft/vscode-extension-samples · GitHub](https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample/src/extension.ts#:~:text=webviewView.webview.options%20%3D%20)) ([vscode-extension-samples/webview-view-sample/src/extension.ts at main · microsoft/vscode-extension-samples · GitHub](https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample/src/extension.ts#:~:text=webviewView)). The actual HTML (returned by `this.getHtml()`) contains our form and scripts as discussed. We ensure to set a proper Content Security Policy in the HTML (only allow sources from our extension).

- **Updating the JSON (updateDevcontainerConfig in the provider or a separate module):**  
  ```ts
  import * as jsonc from 'jsonc-parser';
  async function updateDevcontainerConfig(newConfig: ConfigData): Promise<void> {
    const devUri = await findDevcontainerUri();
    if (!devUri) {
      vscode.window.showErrorMessage("devcontainer.json not found.");
      return;
    }
    const textDoc = await vscode.workspace.openTextDocument(devUri);
    let jsonObj: any = jsonc.parse(textDoc.getText());
    // Apply network changes
    if (newConfig.networkMode) {
      // remove existing --network args
      if (jsonObj.runArgs) {
        jsonObj.runArgs = jsonObj.runArgs.filter((arg: string, i: number, arr: string[]) => {
          return !(arg === "--network" || (i > 0 && arr[i-1] === "--network"));
        });
      } else {
        jsonObj.runArgs = [];
      }
      if (newConfig.networkMode !== 'default') {
        const netArg = newConfig.networkMode === 'custom' ? newConfig.customNetwork : newConfig.networkMode;
        jsonObj.runArgs.push("--network", netArg);
      }
    }
    // Apply GPU changes
    if (newConfig.enableGpu) {
      // Add --gpus flag
      let gpuFlag = "all";
      if (newConfig.gpuMode === "count") {
        gpuFlag = newConfig.gpuCount.toString();
      } else if (newConfig.gpuMode === "devices") {
        gpuFlag = `\"device=${newConfig.gpuDevices}\"`;
      }
      // Remove existing --gpus if any, then add our new one:
      jsonObj.runArgs = jsonObj.runArgs.filter((arg: string) => arg !== "--gpus");
      jsonObj.runArgs = jsonObj.runArgs.filter((arg: string, i: number, arr: string[]) => {
        return !(i > 0 && arr[i-1] === "--gpus");
      });
      jsonObj.runArgs.push("--gpus", gpuFlag);
      // Set hostRequirements.gpu = true
      jsonObj.hostRequirements = jsonObj.hostRequirements || {};
      jsonObj.hostRequirements.gpu = true;
      // Set environment variables for CUDA if needed
      if (newConfig.setCudaEnv) {
        jsonObj.remoteEnv = jsonObj.remoteEnv || {};
        jsonObj.remoteEnv.CUDA_VISIBLE_DEVICES = 
          (newConfig.gpuMode === "all") ? "all" : (newConfig.gpuMode === "count") ? 
            Array.from({length:newConfig.gpuCount}, (_,i)=>i).join(',') : newConfig.gpuDevices;
        jsonObj.remoteEnv.NVIDIA_VISIBLE_DEVICES = jsonObj.remoteEnv.CUDA_VISIBLE_DEVICES;
      }
    } else {
      // If GPU was disabled, remove related entries
      if (jsonObj.runArgs) {
        jsonObj.runArgs = jsonObj.runArgs.filter((arg: string) => arg !== "--gpus" && arg !== "all");
      }
      if (jsonObj.hostRequirements?.gpu) {
        jsonObj.hostRequirements.gpu = false;
      }
      if (jsonObj.remoteEnv) {
        delete jsonObj.remoteEnv.CUDA_VISIBLE_DEVICES;
        delete jsonObj.remoteEnv.NVIDIA_VISIBLE_DEVICES;
      }
    }
    // Write back the file
    const edit = new vscode.WorkspaceEdit();
    const newText = JSON.stringify(jsonObj, null, 4);
    const fullRange = new vscode.Range(0, 0, textDoc.lineCount, 0);
    edit.replace(devUri, fullRange, newText);
    await vscode.workspace.applyEdit(edit);
    await textDoc.save();
    // Trigger validation (optional)
    const diagnostics = vscode.languages.getDiagnostics(devUri);
    if (diagnostics.some(d => d.severity === vscode.DiagnosticSeverity.Error)) {
      vscode.window.showWarningMessage("devcontainer.json saved with errors. Please check the file.");
    }
  }
  ```  

  This code does the following: reads and parses the JSON (using a JSONC parser to ignore comments), updates the relevant parts for network and GPU, and then writes it back using `WorkspaceEdit` (which is applied and saved). We ensure to maintain the JSON structure properly. (In practice, one might refine this code to preserve comments or formatting as noted.) After saving, we retrieve any diagnostics; if errors exist, we notify the user. 

### Additional Considerations for UX and Compatibility  

- **Two-way Sync:** If the user manually edits `devcontainer.json` (outside of our UI), we should reflect those changes in our sidebar UI. We can listen to file changes with `vscode.workspace.onDidChangeTextDocument`. When the devcontainer file changes, our extension can parse the new content and update the webview (sending a message to the webview to update form fields). This ensures the UI is always in sync with the file on disk, preventing confusion.  
- **File Creation:** If no `devcontainer.json` exists, the extension can offer to create one (maybe when the view is opened). It could use a VS Code command like **“Dev Containers: Add Dev Container Configuration Files”** (if Remote-Containers extension is installed) or create a minimal file itself. A minimal template might include the `$schema` property and an empty `{}` which the user can then populate via the UI.  
- **Non-intrusive Design:** The extension should co-exist with the official **Remote - Containers** extension. It doesn’t override any VS Code core behavior; it simply provides an alternate way to edit the config. All changes go through the standard file, so the Remote-Containers extension will pick them up (usually, rebuilding the container is required for changes to take effect). We will advise the user (via a notification or documentation) to **“Rebuild Dev Container”** after making changes. We can even prompt: “Devcontainer updated. Rebuild now?” and call the VS Code command `Remote-Containers: Rebuild Container`. This enhances the UX by streamlining the apply->rebuild cycle.  
- **Performance:** The devcontainer.json is typically small, so performance is not a concern. However, we avoid doing heavy work on each keystroke. That’s why an explicit “Apply” or debounced save is used instead of writing on every change immediately.  
- **Accessibility:** The webview UI should be navigable via keyboard (tab order for inputs) and readable by screen readers. Use proper labels for inputs. VS Code’s webview accessibility guidelines should be followed. 
- **Theming:** Use VS Code theme colors for any custom CSS in the webview. For example, background should match sidebar background, text should use the theme’s foreground. This can be done by including the VS Code provided CSS (as in the webview sample, linking to `vscode.css` ([vscode-extension-samples/webview-view-sample/src/extension.ts at main · microsoft/vscode-extension-samples · GitHub](https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample/src/extension.ts#:~:text=const%20styleResetUri%20%3D%20webview,css))) or using CSS variables. This ensures our UI feels native.  
- **Testing:** We would test the extension in various scenarios: with an existing devcontainer.json (with and without GPU already configured), with no devcontainer file, with the extension running locally vs in a remote (WSL/Codespaces) context, etc. We also verify that the JSON schema integration provides proper suggestions (for instance, when editing the file directly, the user should see schema docs for fields like `runArgs` and `hostRequirements` as defined by the dev container spec).  
- **Documentation and Guidance:** The extension’s README will include usage instructions and mention what each UI element corresponds to in `devcontainer.json`. For instance, we’ll document that enabling GPU adds `--gpus` and that Docker’s *NVIDIA Container Toolkit* must be installed on the host for this to work ([python - Using GPU in VS code container - Stack Overflow](https://stackoverflow.com/questions/72129213/using-gpu-in-vs-code-container#:~:text=make%20sure%20you%20have%20NVIDIA,use%20the%20command%3A%20CUDA)). We’ll also link to Docker’s documentation on network modes and to the devcontainer spec reference. This helps users understand the context of the options we expose.  

By adhering to these guidelines and using VS Code’s recommended APIs, the extension will provide a smooth, integrated experience for editing `devcontainer.json`. It leverages the power of webviews for rich UI ([Webview API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/webview#:~:text=The%20webview%20API%20allows%20extensions,VS%20Code%27s%20native%20APIs%20support)) while ensuring that standard VS Code mechanisms (JSON validation, undo/redo, settings sync) continue to work with the configuration file ([JSON Schema - Resources, Notes, and VSCode Tips | Joshua's Docs](https://docs.joshuatz.com/cheatsheets/js/json-schema/#:~:text=,example)). This approach results in a user-friendly form-based editor for dev container settings, making it easier to configure Docker networks and GPU support without manually editing JSON, yet never locking the user out of manual tweaks. 

**Sources:**

- Visual Studio Code Webview API Documentation ([Webview API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/webview#:~:text=The%20webview%20API%20allows%20extensions,VS%20Code%27s%20native%20APIs%20support)) ([Webview API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/webview#:~:text=,sample%20extension%20for%20more%20details))  
- VSCode Extension Webview View Sample (GitHub) ([vscode-extension-samples/webview-view-sample/src/extension.ts at main · microsoft/vscode-extension-samples · GitHub](https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample/src/extension.ts#:~:text=webviewView.webview.options%20%3D%20)) ([vscode-extension-samples/webview-view-sample/src/extension.ts at main · microsoft/vscode-extension-samples · GitHub](https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample/src/extension.ts#:~:text=webviewView))  
- Stack Overflow – *How to add a Webview to VSCode sidebar* ([view - VS Code Extension - How to add a WebviewPanel to the sidebar? - Stack Overflow](https://stackoverflow.com/questions/67150547/vs-code-extension-how-to-add-a-webviewpanel-to-the-sidebar#:~:text=registerWebviewViewProvider,sample%20linked%20on%20that%20page)) ([view - VS Code Extension - How to add a WebviewPanel to the sidebar? - Stack Overflow](https://stackoverflow.com/questions/67150547/vs-code-extension-how-to-add-a-webviewpanel-to-the-sidebar#:~:text=%7B%20,))  
- Docker Networking Modes (Bridge/Host/None) ([Docker Cheat Sheet - Docker Networks - DEV Community](https://dev.to/manojpatra1991/docker-cheat-sheet-docker-networks-49k4#:~:text=Default%20network%20types))  
- VS Code Devcontainer JSON GPU support discussions ([python - Using GPU in VS code container - Stack Overflow](https://stackoverflow.com/questions/72129213/using-gpu-in-vs-code-container#:~:text=%22features%22%3A%20%7B%20%22ghcr.io%2Fdevcontainers%2Ffeatures%2Fnvidia,)) ([devcontainer.json schema](https://containers.dev/implementors/json_schema/#:~:text=))  
- VS Code Custom Editor & JSON Edit Best Practices ([Custom Editor API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/custom-editors#:~:text=3,vscode.workspace.applyEdit)) ([Custom Editor API | Visual Studio Code Extension API](https://code.visualstudio.com/api/extension-guides/custom-editors#:~:text=Also%20remember%20that%20if%20you,and%20how%20to%20fix%20it))  
- VS Code JSON Schema and Validation Docs ([Editing JSON with Visual Studio Code](https://code.visualstudio.com/Docs/languages/json#:~:text=In%20addition%20to%20the%20default,editor%20will%20display%20a%20warning))